const { Readable } = require('stream')

// ElevenLabs text-to-speech for the manager's browser test phone. The API key
// stays on the server (ELEVENLABS_API_KEY in slam.env); the browser only ever
// receives finished audio. Real phone calls don't come through here — Twilio
// talks to ElevenLabs itself, configured by the TwiML in twilio.js.

const API = 'https://api.elevenlabs.io'

function hasElevenKey() {
  return !!process.env.ELEVENLABS_API_KEY
}

class ElevenError extends Error {
  constructor(status, body) {
    let detail = body
    try {
      const j = JSON.parse(body)
      detail = j.detail?.message || j.detail?.status || JSON.stringify(j.detail || j)
    } catch {
      // plain-text error body
    }
    super(`ElevenLabs ${status}: ${String(detail).slice(0, 200)}`)
    this.status = status
  }
}

async function call(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, ...(init.headers || {}) },
  })
  if (!res.ok) throw new ElevenError(res.status, await res.text())
  return res
}

async function listVoices() {
  const res = await call('/v2/voices?page_size=100')
  const data = await res.json()
  return (data.voices || []).map((v) => ({
    id: v.voice_id,
    name: v.name,
    category: v.category,
    labels: v.labels || {},
    preview: v.preview_url || null,
  }))
}

// With no voice chosen in settings, prefer one labelled Greek, else the first.
let autoVoice = null
async function resolveVoice(settings) {
  if (settings.elevenVoiceId) return settings.elevenVoiceId
  if (!autoVoice) {
    const voices = await listVoices()
    const greek = voices.find((v) => String(v.labels.language || '').startsWith('el') || /greek/i.test(v.labels.accent || ''))
    autoVoice = (greek || voices[0])?.id || null
  }
  if (!autoVoice) throw new ElevenError(404, 'No voices in this ElevenLabs account')
  return autoVoice
}

// Streams MP3 audio of `text` into an Express response.
async function speakTo(res, { text, lang, settings }) {
  const voice = await resolveVoice(settings)
  const model = settings.elevenModel || 'eleven_flash_v2_5'
  const body = { text, model_id: model }
  // language_code pins the pronunciation; multilingual_v2 rejects it.
  if (!/multilingual_v2/.test(model)) body.language_code = lang === 'en' ? 'en' : 'el'
  const audio = await call(`/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify(body),
  })
  res.type('audio/mpeg')
  Readable.fromWeb(audio.body).pipe(res)
}

module.exports = { hasElevenKey, listVoices, speakTo, ElevenError }
