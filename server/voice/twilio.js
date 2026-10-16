const crypto = require('crypto')
const express = require('express')
const { WebSocketServer } = require('ws')
const { getSettings } = require('./settings')
const { CallSession, Anthropic } = require('./agent')

// Phone calls arrive through Twilio:
//   1. A call hits POST /api/voice/incoming → we answer with TwiML that opens
//      a ConversationRelay WebSocket (Twilio does speech-to-text and
//      text-to-speech; we only exchange text).
//   2. The WebSocket at /api/voice/relay runs a CallSession (Claude + tools).
//   3. When the agent ends the session, Twilio calls POST /api/voice/handoff,
//      where we either hang up or put the caller through to the bar.

const RELAY_PATH = '/api/voice/relay'

function hasClaudeCredentials() {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)
}

let client = null
function claudeClient() {
  if (!hasClaudeCredentials()) return null
  if (!client) client = new Anthropic()
  return client
}

// Public origin as Twilio sees it (e.g. https://slambar.gr). Signatures are
// computed over the exact public URL, so set PUBLIC_URL in production.
function publicBase(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '')
  const proto = req.headers['x-forwarded-proto'] || (req.socket.encrypted ? 'https' : 'http')
  return `${String(proto).split(',')[0]}://${req.headers.host}`
}

// Twilio request signature: base64(HMAC-SHA1(authToken, url + each POST
// param name+value in sorted name order)).
function twilioSignature(authToken, url, params = {}) {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + (params[k] ?? ''), url)
  return crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64')
}

function signatureMatches(given, urls, params) {
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!token || typeof given !== 'string' || !given) return false
  const g = Buffer.from(given)
  return urls.some((url) => {
    const expected = Buffer.from(twilioSignature(token, url, params))
    return expected.length === g.length && crypto.timingSafeEqual(expected, g)
  })
}

function xml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function sendTwiml(res, body) {
  res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<Response>${body}</Response>`)
}

const SAY_EL = 'language="el-GR" voice="Google.el-GR-Wavenet-B"'
const UNAVAILABLE = 'Το Slam Bar δεν μπορεί να απαντήσει αυτή τη στιγμή. Παρακαλώ καλέστε ξανά αργότερα. Ευχαριστούμε!'
const NO_ANSWER = 'Δεν απαντά κανείς αυτή τη στιγμή. Παρακαλώ καλέστε ξανά σε λίγο. Ευχαριστούμε!'

function dialTwiml(number) {
  return `<Dial timeout="25">${xml(number)}</Dial><Say ${SAY_EL}>${NO_ANSWER}</Say>`
}

function relayTwiml(base, s) {
  const wss = `${base.replace(/^http/, 'ws')}${RELAY_PATH}`
  // An explicit voice wins; with ElevenLabs and none set, use the chosen
  // ElevenLabs voice on the Flash 2.5 model (Twilio has no Greek default).
  const voiceFor = (explicit) =>
    explicit || (s.ttsProvider === 'ElevenLabs' && s.elevenVoiceId ? `${s.elevenVoiceId}-flash_v2_5` : '')
  const voiceAttr = (v) => (v ? ` voice="${xml(v)}"` : '')
  const lang = (code, voice) =>
    `<Language code="${code}" ttsProvider="${xml(s.ttsProvider)}"${voiceAttr(voiceFor(voice))} transcriptionProvider="${xml(
      s.transcriptionProvider
    )}" speechModel="${xml(s.speechModel)}"/>`
  return (
    `<Connect action="${xml(base)}/api/voice/handoff">` +
    `<ConversationRelay url="${xml(wss)}" language="el-GR" welcomeGreeting="${xml(s.greeting)}" ` +
    `ttsProvider="${xml(s.ttsProvider)}"${voiceAttr(voiceFor(s.voiceEl))} transcriptionProvider="${xml(
      s.transcriptionProvider
    )}" speechModel="${xml(s.speechModel)}" dtmfDetection="true" interruptible="any">` +
    lang('el-GR', s.voiceEl) +
    lang('en-US', s.voiceEn) +
    `</ConversationRelay></Connect>`
  )
}

// ---- HTTP webhooks ----

function createVoiceRouter() {
  const r = express.Router()
  r.use(express.urlencoded({ extended: false }))

  // Only Twilio may call these.
  const twilioOnly = (req, res, next) => {
    if (!process.env.TWILIO_AUTH_TOKEN) return res.status(503).send('Voice line not configured')
    const url = publicBase(req) + req.originalUrl
    if (!signatureMatches(req.headers['x-twilio-signature'], [url], req.body || {})) {
      console.warn(`[voice] rejected unsigned request to ${req.originalUrl}`)
      return res.status(403).send('Forbidden')
    }
    next()
  }

  r.post('/incoming', twilioOnly, (req, res) => {
    const s = getSettings()
    if (!s.agentEnabled || !hasClaudeCredentials()) {
      // Agent off (or no API key yet): ring the bar, or apologise.
      return sendTwiml(res, s.transferNumber ? dialTwiml(s.transferNumber) : `<Say ${SAY_EL}>${UNAVAILABLE}</Say><Hangup/>`)
    }
    sendTwiml(res, relayTwiml(publicBase(req), s))
  })

  r.post('/handoff', twilioOnly, (req, res) => {
    const s = getSettings()
    let data = {}
    try {
      data = JSON.parse(req.body.HandoffData || '{}')
    } catch {
      data = {}
    }
    const failed = !!req.body.ErrorCode
    if ((data.reason === 'transfer' || failed) && s.transferNumber) return sendTwiml(res, dialTwiml(s.transferNumber))
    if (failed) return sendTwiml(res, `<Say ${SAY_EL}>${UNAVAILABLE}</Say><Hangup/>`)
    sendTwiml(res, '<Hangup/>')
  })

  return r
}

// ---- WebSocket relay ----

function authorizeRelay(req, url, sessionOf) {
  if (url.searchParams.get('test') === '1') {
    // Browser test calls from the manager screen (same-origin session cookie).
    const staff = sessionOf(req)
    return staff && staff.role === 'manager' ? { test: true } : null
  }
  const base = publicBase(req)
  const host = `${req.headers.host}${req.url}`
  const candidates = [
    `${base.replace(/^http/, 'ws')}${req.url}`,
    `${base}${req.url}`,
    `wss://${host}`,
    `https://${host}`,
  ]
  return signatureMatches(req.headers['x-twilio-signature'], [...new Set(candidates)], {}) ? { test: false } : null
}

function attachVoiceRelay(httpServer, { notify, sessionOf }) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 })

  httpServer.on('upgrade', (req, socket, head) => {
    let url
    try {
      url = new URL(req.url, 'http://localhost')
    } catch {
      return
    }
    if (url.pathname !== RELAY_PATH) return // Socket.IO / Next handle their own upgrades
    const auth = authorizeRelay(req, url, sessionOf)
    if (!auth) {
      console.warn('[voice] rejected relay connection (bad signature / not a manager)')
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, auth, notify))
  })
  return wss
}

function onConnection(ws, auth, notify) {
  let session = null
  const send = (m) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m))
  }

  ws.on('message', (raw) => {
    let msg
    try {
      msg = JSON.parse(raw)
    } catch {
      return
    }
    switch (msg.type) {
      case 'setup': {
        if (session) return
        const c = claudeClient()
        if (!c) {
          send({ type: 'text', token: 'Συγγνώμη, ο αυτόματος τηλεφωνητής δεν είναι ακόμη ενεργός.', last: true })
          setTimeout(() => send({ type: 'end', handoffData: JSON.stringify({ reason: 'transfer', detail: 'no API key' }) }), 4000)
          return
        }
        session = new CallSession({
          client: c,
          send,
          settings: getSettings(),
          callerNumber: String(msg.from || ''),
          callSid: String(msg.callSid || ''),
          isTest: auth.test,
          notify,
        })
        notify('voice', 'call_started')
        return
      }
      case 'prompt':
        if (session && msg.last !== false) session.handlePrompt(msg.voicePrompt)
        return
      case 'interrupt':
        session?.handleInterrupt(msg.utteranceUntilInterrupt)
        return
      case 'dtmf':
        session?.handleDtmf(String(msg.digit || ''))
        return
      case 'error':
        console.warn('[voice] relay error from Twilio:', msg.description)
        return
      default:
    }
  })
  ws.on('close', () => session?.close())
  ws.on('error', () => session?.close())
}

function voiceStatus(req) {
  const base = publicBase(req)
  return {
    hasClaudeKey: hasClaudeCredentials(),
    hasTwilioToken: !!process.env.TWILIO_AUTH_TOKEN,
    hasElevenKey: !!process.env.ELEVENLABS_API_KEY,
    webhookUrl: `${base}/api/voice/incoming`,
  }
}

module.exports = { createVoiceRouter, attachVoiceRelay, voiceStatus, twilioSignature, relayTwiml, RELAY_PATH }
