const AnthropicModule = require('@anthropic-ai/sdk')
const db = require('../db')
const B = require('../bookings')
const { TOOLS, runTool } = require('./tools')
const { systemPrompt, callContext } = require('./prompt')

const Anthropic = AnthropicModule.default || AnthropicModule

const MODEL = 'claude-opus-5-5'
const MAX_STEPS = 8 // model calls per caller turn (tool round-trips)
const MAX_CALL_MS = 15 * 60e3

// Short lines the server says itself, without the model.
const LINES = {
  el: {
    moment: 'Μισό λεπτό.',
    trouble: 'Συγγνώμη, έχουμε ένα τεχνικό πρόβλημα.',
    connecting: 'Σας συνδέω με το μπαρ.',
    callBack: 'Παρακαλώ καλέστε μας ξανά σε λίγο. Ευχαριστούμε!',
    cantHelp: 'Συγγνώμη, σε αυτό δεν μπορώ να βοηθήσω. Θέλετε να αφήσετε μήνυμα στο προσωπικό;',
    timeUp: 'Πρέπει να κλείσω τώρα — καλέστε ξανά αν χρειάζεστε κάτι. Γεια σας!',
  },
  en: {
    moment: 'One moment.',
    trouble: "Sorry, we're having a technical problem.",
    connecting: "I'll put you through to the bar.",
    callBack: 'Please call us again in a little while. Thank you!',
    cantHelp: "Sorry, I can't help with that one. Would you like to leave a message for the staff?",
    timeUp: "I have to wrap up now — call again if you need anything. Goodbye!",
  },
}

const FILLER_TOOLS = new Set(['check_availability', 'create_booking', 'lookup_bookings', 'cancel_booking', 'get_menu'])

// One phone call. Speaks the ConversationRelay protocol through `send`:
// it receives the caller's transcribed speech and answers with text tokens
// that Twilio turns into speech.
class CallSession {
  constructor({ client, send, settings, callerNumber = '', callSid = '', isTest = false, notify = () => {} }) {
    this.client = client
    this.send = send
    this.settings = settings
    this.notify = notify
    this.isTest = isTest
    this.callerNumber = B.normalizePhone(callerNumber)
    this.lang = 'el'
    this.system = systemPrompt(settings)
    this.messages = [] // append-only: the API checks history against earlier thinking
    this.pending = []
    this.cutOffNote = ''
    this.contextAdded = false
    this.running = false
    this.stream = null
    this.ended = false
    this.after = null // { kind: 'hangup' | 'transfer', reason } once the agent decides
    this.lastSpoken = ''
    this.transcript = []
    this.outcomes = []
    this.usage = { input: 0, output: 0, cacheRead: 0 }
    this.timers = new Set()

    this.callId = db
      .prepare('INSERT INTO voice_calls (call_sid, from_number, is_test, started_at) VALUES (?, ?, ?, ?)')
      .run(String(callSid).slice(0, 64), this.callerNumber, isTest ? 1 : 0, new Date().toISOString()).lastInsertRowid

    this.later(() => this.timeUp(), MAX_CALL_MS)
    this.event('call started')
  }

  // ---- inbound protocol events ----

  handlePrompt(text) {
    const t = String(text || '').trim()
    if (!t || this.ended) return
    this.transcript.push({ who: 'caller', text: t, at: Date.now() })
    // Still talking after the agent decided to hang up: keep the line open.
    if (this.after?.kind === 'hangup') this.after = null
    this.pending.push(t)
    if (this.running) this.abortStream() // caller is talking again: drop the reply in progress
    this.pump()
  }

  handleInterrupt(heard) {
    if (this.ended) return
    this.abortStream()
    const h = String(heard || '').trim()
    this.cutOffNote = h
      ? `(The caller interrupted you; they only heard: "${h}")`
      : '(The caller interrupted you before hearing your reply.)'
    this.event('caller interrupted')
  }

  handleDtmf(digit) {
    if (this.ended) return
    const lang = digit === '2' ? 'en' : digit === '1' ? 'el' : null
    if (!lang) return
    this.setLanguage(lang)
    this.pending.push(`(The caller pressed ${digit} on the keypad to switch to ${lang === 'en' ? 'English' : 'Greek'}.)`)
    this.pump()
  }

  close() {
    if (this.closed) return
    this.closed = true
    this.ended = true
    this.abortStream()
    for (const t of this.timers) clearTimeout(t)
    this.event(`call closed · tokens in ${this.usage.input} (cached ${this.usage.cacheRead}) out ${this.usage.output}`)
    db.prepare('UPDATE voice_calls SET ended_at = ?, outcome = ?, transcript = ? WHERE id = ?').run(
      new Date().toISOString(),
      this.outcomes.join(' · ') || 'no action',
      JSON.stringify(this.transcript),
      this.callId
    )
    this.notify('voice', 'call_ended')
  }

  // ---- the conversation loop ----

  async pump() {
    if (this.running) return
    this.running = true
    try {
      while (this.pending.length && !this.ended) {
        const said = this.pending.splice(0).join(' ')
        const text = this.cutOffNote ? `${this.cutOffNote}\n${said}` : said
        this.cutOffNote = ''
        this.appendUser(text)
        await this.respond()
      }
    } finally {
      this.running = false
    }
  }

  appendUser(text) {
    const last = this.messages[this.messages.length - 1]
    let context = null
    if (!this.contextAdded) {
      context = callContext({ callerNumber: this.callerNumber, lang: this.lang, isTest: this.isTest })
    } else if (last && last.role === 'system') {
      // The call context must be followed by an assistant turn. The first
      // reply was cut off before one existed, so move the context after this
      // message — nothing has been generated yet, so no history depends on it.
      context = this.messages.pop().content
    }
    this.messages.push({ role: 'user', content: text })
    if (context) {
      this.messages.push({ role: 'system', content: context })
      this.contextAdded = true
    }
  }

  async respond() {
    let jsonRetries = 0
    for (let step = 0; step < MAX_STEPS && !this.ended; step++) {
      if (this.pending.length) return // newer caller speech wins
      const turn = { spoke: '', filler: false }
      let message
      try {
        const stream = this.client.beta.messages.stream({
          model: MODEL,
          max_tokens: 16000,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: { effort: 'low' },
          cache_control: { type: 'ephemeral' },
          system: this.system,
          tools: TOOLS,
          messages: this.messages,
        })
        this.stream = stream
        stream.on('text', (delta) => {
          turn.spoke += delta
          this.say(delta)
        })
        stream.on('streamEvent', (event) => {
          // A lookup is about to run before anything was said: fill the gap.
          if (
            event.type === 'content_block_start' &&
            event.content_block.type === 'tool_use' &&
            FILLER_TOOLS.has(event.content_block.name) &&
            !turn.spoke &&
            !turn.filler
          ) {
            turn.filler = true
            this.sayLine(LINES[this.lang].moment)
          }
        })
        message = await stream.finalMessage()
        jsonRetries = 0
      } catch (err) {
        this.stream = null
        if (err instanceof Anthropic.APIUserAbortError) {
          if (turn.spoke) {
            this.finishUtterance()
            this.transcript.push({ who: 'agent', text: `${turn.spoke.trim()} …(cut off)`, at: Date.now() })
          }
          return
        }
        // The SDK reports an unparseable streamed tool input as a bare
        // AnthropicError; only that is worth re-issuing.
        const badToolJson = err instanceof Anthropic.AnthropicError && !(err instanceof Anthropic.APIError)
        if (badToolJson && jsonRetries++ < 2) {
          console.warn('[voice] unparseable tool input, re-issuing the turn')
          continue
        }
        return this.fail(err)
      }
      this.stream = null
      this.track(message.usage)
      if (turn.spoke) {
        this.finishUtterance()
        this.lastSpoken = turn.spoke
        this.transcript.push({ who: 'agent', text: turn.spoke.trim(), at: Date.now() })
      }

      if (message.stop_reason === 'refusal') {
        // The fallback model declined too. Don't keep the partial turn.
        this.event('model declined')
        this.sayLine(LINES[this.lang].cantHelp)
        return
      }
      const toolUses = message.content.filter((b) => b.type === 'tool_use')
      if (message.stop_reason === 'max_tokens' && toolUses.length) {
        return this.fail(new Error('tool input truncated at max_tokens'))
      }

      this.messages.push({ role: 'assistant', content: message.content })
      if (message.stop_reason !== 'tool_use' || toolUses.length === 0) {
        this.maybeFinish()
        return
      }

      const results = toolUses.map((tu) => {
        const r = runTool(tu.name, tu.input, this.toolContext())
        this.event(`${tu.name}${r.isError ? ' (error)' : ''}`, { input: tu.input, result: safeParse(r.content) })
        return { type: 'tool_result', tool_use_id: tu.id, content: r.content, ...(r.isError ? { is_error: true } : {}) }
      })
      this.messages.push({ role: 'user', content: results })
    }
    this.maybeFinish()
  }

  toolContext() {
    return {
      callerNumber: this.callerNumber,
      callId: this.callId,
      isTest: this.isTest,
      settings: this.settings,
      notify: this.notify,
      log: (o) => {
        if (o.booking) this.outcomes.push(`booked ${o.booking}`)
        if (o.cancelled) this.outcomes.push(`cancelled ${o.cancelled}`)
        if (o.message) this.outcomes.push('left a message')
      },
      onLanguage: (lang) => this.setLanguage(lang),
      onTransfer: (reason) => {
        this.after = { kind: 'transfer', reason }
        this.outcomes.push('transferred to staff')
      },
      onEnd: () => {
        if (!this.after) this.after = { kind: 'hangup' }
      },
    }
  }

  // After the agent's final words for this turn, hang up or transfer if it
  // asked to — leaving time for the speech to play out first.
  maybeFinish() {
    if (!this.after || this.ended) return
    const words = this.lastSpoken.split(/\s+/).filter(Boolean).length
    const wait = Math.min(10000, 1200 + words * 380)
    this.ended = true
    const { kind, reason } = this.after
    this.later(() => this.send({ type: 'end', handoffData: JSON.stringify({ reason: kind, detail: reason || '' }) }), wait)
  }

  fail(err) {
    console.error('[voice] model call failed:', err?.status || '', err?.message || err)
    // Keep the API's own explanation (e.g. "credit balance is too low") in
    // the call log, so the manager sees why without reading server output.
    const reason = err?.error?.error?.message || err?.message || String(err)
    this.event(`error: assistant unavailable — ${String(reason).slice(0, 200)}`)
    const L = LINES[this.lang]
    const line = this.settings.transferNumber ? `${L.trouble} ${L.connecting}` : `${L.trouble} ${L.callBack}`
    this.sayLine(line)
    this.lastSpoken = line
    if (this.settings.transferNumber) {
      this.after = { kind: 'transfer', reason: 'assistant error' }
      this.outcomes.push('error → transferred')
    } else {
      this.after = { kind: 'hangup' }
      this.outcomes.push('error')
    }
    this.maybeFinish()
  }

  timeUp() {
    if (this.ended) return
    this.abortStream()
    this.pending = []
    this.sayLine(LINES[this.lang].timeUp)
    this.lastSpoken = LINES[this.lang].timeUp
    this.after = { kind: 'hangup' }
    this.outcomes.push('time limit')
    this.maybeFinish()
  }

  // ---- outbound helpers ----

  setLanguage(lang) {
    if (lang === this.lang) return
    this.lang = lang
    const code = lang === 'en' ? 'en-US' : 'el-GR'
    this.send({ type: 'language', ttsLanguage: code, transcriptionLanguage: code })
    this.event(`language → ${lang}`)
  }

  say(token) {
    this.send({ type: 'text', token, last: false })
  }

  finishUtterance() {
    this.send({ type: 'text', token: '', last: true })
  }

  sayLine(text) {
    this.send({ type: 'text', token: text, last: true })
    this.transcript.push({ who: 'agent', text, at: Date.now() })
  }

  abortStream() {
    if (this.stream) {
      try {
        this.stream.abort()
      } catch {
        // already finished
      }
    }
  }

  track(usage) {
    if (!usage) return
    this.usage.input += (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0)
    this.usage.cacheRead += usage.cache_read_input_tokens || 0
    this.usage.output += usage.output_tokens || 0
  }

  event(text, data) {
    this.transcript.push({ who: 'event', text, ...(data ? { data } : {}), at: Date.now() })
  }

  later(fn, ms) {
    const t = setTimeout(() => {
      this.timers.delete(t)
      fn()
    }, ms)
    this.timers.add(t)
  }
}

function safeParse(s) {
  try {
    return JSON.parse(s)
  } catch {
    return s
  }
}

module.exports = { CallSession, MODEL, Anthropic }
