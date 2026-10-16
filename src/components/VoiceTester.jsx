'use client'
import { useEffect, useRef, useState } from 'react'
import Icon from '@/components/Icon'

// A pretend phone in the browser: it speaks the same protocol Twilio does to
// /api/voice/relay, so a manager can try the real agent (and make real test
// bookings) before any phone number exists. Speech-to-text and text-to-speech
// are the browser's own; typing works everywhere.

const T = {
  el: {
    title: 'Δοκιμή στον browser',
    hint: 'Μιλήστε στον τηλεφωνητή όπως θα έκανε ένας πελάτης. Οι κρατήσεις που κάνει είναι αληθινές (σημειώνονται ως «Δοκιμή»).',
    callerNumber: 'Αριθμός «πελάτη»',
    start: 'Κλήση',
    hangUp: 'Κλείσιμο',
    connecting: 'Σύνδεση…',
    talk: 'Πατήστε και μιλήστε',
    listening: 'Ακούω…',
    type: 'ή γράψτε εδώ…',
    send: 'Αποστολή',
    noMic: 'Αυτός ο browser δεν αναγνωρίζει ομιλία — γράψτε το μήνυμα (ή δοκιμάστε Chrome).',
    keypad: 'Πλήκτρα',
    ended: { hangup: 'Η κλήση τελείωσε.', transfer: 'Εδώ η κλήση θα μεταφερόταν στο μπαρ.' },
    failed: 'Η σύνδεση απέτυχε — είστε συνδεδεμένος ως διαχειριστής;',
    you: 'Εσείς',
    agent: 'Τηλεφωνητής',
    voiceEleven: 'Φωνή: ElevenLabs',
    voiceBrowser: 'Φωνή: του browser',
    elevenFailed: (e) => `Το ElevenLabs δεν απάντησε (${e}) — μιλάει η φωνή του browser.`,
  },
  en: {
    title: 'Try it in the browser',
    hint: 'Talk to the phone agent like a guest would. Bookings it makes are real (marked “Test”).',
    callerNumber: '“Caller” number',
    start: 'Call',
    hangUp: 'Hang up',
    connecting: 'Connecting…',
    talk: 'Tap and speak',
    listening: 'Listening…',
    type: 'or type here…',
    send: 'Send',
    noMic: "This browser can't recognise speech — type instead (or try Chrome).",
    keypad: 'Keypad',
    ended: { hangup: 'The call ended.', transfer: 'Here the call would be put through to the bar.' },
    failed: 'Connection failed — are you logged in as a manager?',
    you: 'You',
    agent: 'Agent',
    voiceEleven: 'Voice: ElevenLabs',
    voiceBrowser: 'Voice: browser',
    elevenFailed: (e) => `ElevenLabs didn't answer (${e}) — using the browser voice.`,
  },
}

function pickVoice(lang) {
  const voices = window.speechSynthesis?.getVoices() || []
  return voices.find((v) => v.lang?.toLowerCase().startsWith(lang)) || null
}

// A silent clip played inside the "Call" click unlocks audio for the rest of the
// call — Safari otherwise blocks sound that isn't started by a tap.
const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='

export default function VoiceTester({ lang: uiLang, greeting, eleven = false, className = '' }) {
  const t = T[uiLang]
  const [status, setStatus] = useState('idle')
  const [log, setLog] = useState([])
  const [partial, setPartial] = useState('')
  const [heard, setHeard] = useState('')
  const [listening, setListening] = useState(false)
  const [typed, setTyped] = useState('')
  const [number, setNumber] = useState('+306900000000')
  const [hasSR, setHasSR] = useState(true)

  const ws = useRef(null)
  const callLang = useRef('el')
  const buffer = useRef('')
  const rec = useRef(null)
  const logEnd = useRef(null)
  const player = useRef(null)
  const queue = useRef(Promise.resolve())
  const pending = useRef(0)
  const generation = useRef(0)
  const [voiceNote, setVoiceNote] = useState('')

  useEffect(() => {
    setHasSR(!!(window.SpeechRecognition || window.webkitSpeechRecognition))
    window.speechSynthesis?.getVoices()
    return () => hangUp()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: 'nearest' })
  }, [log, partial])

  const add = (who, text) => setLog((l) => [...l, { who, text, id: Math.random() }])

  const speakBrowser = (text) => {
    const synth = window.speechSynthesis
    if (!synth || !text.trim()) return
    const u = new SpeechSynthesisUtterance(text)
    u.lang = callLang.current === 'en' ? 'en-US' : 'el-GR'
    const v = pickVoice(callLang.current)
    if (v) u.voice = v
    synth.speak(u)
  }

  // ElevenLabs: start fetching each reply right away, play them in order.
  const speak = (text) => {
    if (!text.trim()) return
    if (!eleven) return speakBrowser(text)
    const gen = generation.current
    const audio = fetch('/api/voice/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, lang: callLang.current }),
    }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`)
      return URL.createObjectURL(await r.blob())
    })
    pending.current++
    queue.current = queue.current.then(async () => {
      try {
        let url
        try {
          url = await audio
        } catch (e) {
          if (gen === generation.current) {
            setVoiceNote(t.elevenFailed(e.message))
            speakBrowser(text)
          }
          return
        }
        if (gen !== generation.current || !player.current) return URL.revokeObjectURL(url)
        const a = player.current
        await new Promise((resolve) => {
          a.onended = a.onerror = a.onpause = resolve
          a.src = url
          a.play().catch(resolve)
        })
        URL.revokeObjectURL(url)
      } finally {
        pending.current--
      }
    })
  }

  const stopAudio = () => {
    generation.current++
    player.current?.pause()
    window.speechSynthesis?.cancel()
  }

  const send = (msg) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(msg))
  }

  // Caller talks over the agent: stop the voice and tell the server, like Twilio does.
  const interruptIfSpeaking = () => {
    if (window.speechSynthesis?.speaking || pending.current > 0) {
      stopAudio()
      send({ type: 'interrupt', utteranceUntilInterrupt: '', durationUntilInterruptMs: 0 })
    }
  }

  const start = () => {
    setLog([])
    setVoiceNote('')
    setStatus('connecting')
    if (eleven) {
      player.current = new Audio(SILENCE)
      player.current.play().catch(() => {})
    }
    callLang.current = 'el'
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const sock = new WebSocket(`${proto}://${window.location.host}/api/voice/relay?test=1`)
    ws.current = sock
    sock.onopen = () => {
      setStatus('live')
      sock.send(JSON.stringify({ type: 'setup', callSid: `browser-${Date.now()}`, from: number, to: 'browser' }))
      if (greeting) {
        add('agent', greeting)
        speak(greeting)
      }
    }
    sock.onmessage = (ev) => {
      let m
      try {
        m = JSON.parse(ev.data)
      } catch {
        return
      }
      if (m.type === 'text') {
        buffer.current += m.token
        setPartial(buffer.current)
        if (m.last) {
          const said = buffer.current.trim()
          buffer.current = ''
          setPartial('')
          if (said) {
            add('agent', said)
            speak(said)
          }
        }
      } else if (m.type === 'language') {
        callLang.current = String(m.ttsLanguage || '').startsWith('en') ? 'en' : 'el'
        add('event', `→ ${callLang.current === 'en' ? 'English' : 'Ελληνικά'}`)
      } else if (m.type === 'end') {
        let reason = 'hangup'
        try {
          reason = JSON.parse(m.handoffData || '{}').reason || 'hangup'
        } catch {
          // keep default
        }
        add('event', t.ended[reason] || t.ended.hangup)
        setStatus('ended')
        sock.close()
      }
    }
    sock.onerror = () => {
      add('event', t.failed)
      setStatus('ended')
    }
    sock.onclose = () => setStatus((s) => (s === 'live' || s === 'connecting' ? 'ended' : s))
  }

  function hangUp() {
    try {
      rec.current?.abort()
    } catch {
      // not listening
    }
    stopAudio()
    ws.current?.close()
    setListening(false)
    setStatus((s) => (s === 'idle' ? s : 'ended'))
  }

  const prompt = (text) => {
    const clean = text.trim()
    if (!clean) return
    interruptIfSpeaking()
    add('caller', clean)
    send({ type: 'prompt', voicePrompt: clean, lang: callLang.current === 'en' ? 'en-US' : 'el-GR', last: true })
  }

  const listen = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR || listening) return
    interruptIfSpeaking()
    const r = new SR()
    r.lang = callLang.current === 'en' ? 'en-US' : 'el-GR'
    r.interimResults = true
    r.maxAlternatives = 1
    r.onresult = (e) => {
      let text = ''
      let final = false
      for (const res of e.results) {
        text += res[0].transcript
        if (res.isFinal) final = true
      }
      setHeard(text)
      if (final) {
        setHeard('')
        prompt(text)
      }
    }
    r.onend = () => setListening(false)
    r.onerror = () => setListening(false)
    rec.current = r
    setListening(true)
    r.start()
  }

  const live = status === 'live'

  return (
    <section className={`card p-5 flex flex-col gap-4 ${className}`}>
      <div>
        <h3 className="text-base font-semibold">{t.title}</h3>
        <p className="text-sm text-fog mt-1">{t.hint}</p>
      </div>

      {!live ? (
        <div className="flex gap-2 items-end flex-wrap">
          <label className="flex-1 min-w-40">
            <span className="block text-sm font-medium text-ink mb-1.5">{t.callerNumber}</span>
            <input
              className="field tnum"
              value={number}
              inputMode="tel"
              onChange={(e) => setNumber(e.target.value)}
            />
          </label>
          <button
            onClick={start}
            disabled={status === 'connecting'}
            className="btn bg-palm hover:bg-palm-deep text-white px-6 font-medium disabled:opacity-50"
          >
            <Icon name="phone" size={18} />
            {status === 'connecting' ? t.connecting : t.start}
          </button>
        </div>
      ) : (
        <div className="flex gap-2 items-center">
          <span className="w-2.5 h-2.5 rounded-full bg-coral animate-pulse" />
          <span className="text-sm font-medium flex-1 tnum">{number}</span>
          <span className="text-xs text-fog">{t.keypad}</span>
          {['1', '2'].map((d) => (
            <button key={d} onClick={() => send({ type: 'dtmf', digit: d })} className="w-9 h-9 rounded-full border border-line font-medium hover:bg-sand">
              {d}
            </button>
          ))}
          <button onClick={hangUp} className="btn !min-h-9 bg-coral hover:brightness-95 text-white px-4 text-sm font-medium">
            {t.hangUp}
          </button>
        </div>
      )}

      <div className="text-xs text-fog flex items-center gap-1.5">
        <Icon name="speaker" size={14} />
        {eleven ? t.voiceEleven : t.voiceBrowser}
      </div>
      {voiceNote && <div className="text-xs font-medium text-sun">{voiceNote}</div>}

      {log.length > 0 && (
        <div className="bg-sand rounded-xl p-3 space-y-2 flex-1 min-h-40 max-h-96 overflow-y-auto">
          {log.map((l) =>
            l.who === 'event' ? (
              <div key={l.id} className="text-center text-xs text-fog">
                {l.text}
              </div>
            ) : (
              <div key={l.id} className={`flex ${l.who === 'caller' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[15px] ${
                    l.who === 'caller' ? 'bg-sea text-shell rounded-br-md' : 'bg-shell border border-line rounded-bl-md'
                  }`}
                >
                  {l.text}
                </div>
              </div>
            )
          )}
          {partial && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl rounded-bl-md px-3.5 py-2 text-[15px] bg-shell border border-line text-fog">{partial}</div>
            </div>
          )}
          <div ref={logEnd} />
        </div>
      )}

      {live && (
        <div className="space-y-2">
          {hasSR ? (
            <button
              onClick={listen}
              className={`w-full rounded-xl py-3.5 text-base font-medium transition-colors ${
                listening ? 'bg-coral text-shell alert-pulse [--glow:rgba(201,61,61,0.4)]' : 'bg-sea hover:bg-sea-deep text-shell'
              }`}
            >
              <Icon name="mic" size={22} className="inline -mt-1 mr-2" />
              {listening ? heard || t.listening : t.talk}
            </button>
          ) : (
            <p className="text-sm font-medium text-sun">{t.noMic}</p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              prompt(typed)
              setTyped('')
            }}
            className="flex gap-2"
          >
            <input
              className="field flex-1 min-w-0"
              placeholder={t.type}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
            <button className="btn btn-quiet px-4 text-sm font-medium">{t.send}</button>
          </form>
        </div>
      )}
    </section>
  )
}
