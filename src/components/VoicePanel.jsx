'use client'
import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import VoiceTester from '@/components/VoiceTester'
import Icon from '@/components/Icon'

const T = {
  el: {
    setup: 'Ρύθμιση τηλεφωνικής γραμμής',
    setupHint: 'Για πραγματικές κλήσεις: σύνδεσε έναν αριθμό Twilio και βάλε αυτή τη διεύθυνση στις ρυθμίσεις του («A call comes in» → Webhook, HTTP POST).',
    chipClaude: 'Claude',
    chipEleven: 'Φωνή ElevenLabs',
    chipLine: 'Τηλεφωνική γραμμή',
    on: 'συνδεδεμένο',
    off: 'δεν έχει συνδεθεί',
    secBar: 'Για το μπαρ',
    secBookings: 'Κρατήσεις',
    secCall: 'Στην κλήση',
    claudeOk: 'Ο «εγκέφαλος» (Claude) είναι συνδεδεμένος',
    claudeMissing: 'Λείπει το κλειδί Claude API στον server (ANTHROPIC_API_KEY)',
    twilioOk: 'Το Twilio είναι συνδεδεμένο',
    twilioMissing: 'Λείπει το Twilio (TWILIO_AUTH_TOKEN στον server)',
    elevenOk: 'Η φωνή ElevenLabs είναι συνδεδεμένη',
    elevenMissing: 'Λείπει το κλειδί ElevenLabs (ELEVENLABS_API_KEY) — μιλάει η φωνή του browser',
    voicePick: 'Φωνή ElevenLabs',
    voiceAuto: 'Αυτόματη επιλογή',
    voiceTry: 'Άκου πώς ακούγεται',
    voiceSample: 'Γεια σας, εδώ Slam Bar στην παραλία Αμπωβός! Θέλετε να κλείσετε ομπρέλα για αύριο;',
    voiceHint: 'Όλες οι φωνές μιλάνε ελληνικά — διάλεξε όποια σου αρέσει και πάτα Αποθήκευση.',
    webhook: 'Διεύθυνση για το Twilio («A call comes in» → Webhook, HTTP POST):',
    copy: 'Αντιγραφή',
    copied: 'Αντιγράφηκε',
    enabled: 'Ο τηλεφωνητής απαντά στις κλήσεις',
    disabledNote: 'Κλειστός: οι κλήσεις πάνε κατευθείαν στο τηλέφωνο του μπαρ.',
    messages: 'Μηνύματα για επιστροφή κλήσης',
    noMessages: 'Κανένα μήνυμα.',
    done: 'Έγινε',
    reopen: 'Επαναφορά',
    settings: 'Τι ξέρει ο τηλεφωνητής',
    settingsHint: 'Ό,τι μένει κενό, ο τηλεφωνητής απαντά ότι δεν το γνωρίζει και προτείνει να αφήσουν μήνυμα — δεν εφευρίσκει ποτέ τιμές ή ωράρια.',
    f: {
      transferNumber: ['Τηλέφωνο μπαρ για μεταφορά', '+30 24…'],
      openingHours: ['Ωράριο', 'π.χ. Καθημερινά 10:00–20:00'],
      umbrellaPrice: ['Τιμή ομπρέλας/ξαπλώστρας', 'π.χ. 15€ με 2 ξαπλώστρες'],
      holdPolicy: ['Μέχρι πότε κρατάμε την ομπρέλα', 'π.χ. μέχρι τις 12:00'],
      extraInfo: ['Άλλες πληροφορίες', 'πάρκινγκ, κατοικίδια, εκδηλώσεις…'],
      peoplePerUmbrella: ['Άτομα ανά ομπρέλα'],
      maxDaysAhead: ['Κρατήσεις έως (ημέρες μπροστά)'],
      seasonStart: ['Αρχή σεζόν (κάθε χρόνο)'],
      seasonEnd: ['Τέλος σεζόν (κάθε χρόνο)'],
      closedDates: ['Κλειστές μέρες', 'ΕΕΕΕ-ΜΜ-ΗΗ, χωρισμένες με κόμμα'],
      greeting: ['Χαιρετισμός στην αρχή της κλήσης'],
    },
    noSeason: 'χωρίς όριο',
    voice: 'Ρυθμίσεις για προχωρημένους',
    save: 'Αποθήκευση',
    saved: 'Αποθηκεύτηκε',
    calls: 'Πρόσφατες κλήσεις',
    noCalls: 'Καμία κλήση ακόμη.',
    test: 'δοκιμή',
    withheld: 'απόκρυψη',
  },
  en: {
    setup: 'Phone line setup',
    setupHint: 'For real calls: connect a Twilio number and paste this address into its settings (“A call comes in” → Webhook, HTTP POST).',
    chipClaude: 'Claude',
    chipEleven: 'ElevenLabs voice',
    chipLine: 'Phone line',
    on: 'connected',
    off: 'not connected',
    secBar: 'About the bar',
    secBookings: 'Bookings',
    secCall: 'On the call',
    claudeOk: 'The “brain” (Claude) is connected',
    claudeMissing: 'Claude API key missing on the server (ANTHROPIC_API_KEY)',
    twilioOk: 'Twilio is connected',
    twilioMissing: 'Twilio missing (TWILIO_AUTH_TOKEN on the server)',
    elevenOk: 'The ElevenLabs voice is connected',
    elevenMissing: 'ElevenLabs key missing (ELEVENLABS_API_KEY) — the browser voice is used',
    voicePick: 'ElevenLabs voice',
    voiceAuto: 'Pick automatically',
    voiceTry: 'Hear it',
    voiceSample: 'Γεια σας, εδώ Slam Bar στην παραλία Αμπωβός! Θέλετε να κλείσετε ομπρέλα για αύριο;',
    voiceHint: 'Every voice can speak Greek — pick one you like and press Save.',
    webhook: 'Address for Twilio (“A call comes in” → Webhook, HTTP POST):',
    copy: 'Copy',
    copied: 'Copied',
    enabled: 'The agent answers calls',
    disabledNote: 'Off: calls ring straight through to the bar phone.',
    messages: 'Messages to call back',
    noMessages: 'No messages.',
    done: 'Done',
    reopen: 'Reopen',
    settings: 'What the agent knows',
    settingsHint: 'Anything left empty, the agent says it doesn’t know and offers to take a message — it never makes up prices or hours.',
    f: {
      transferNumber: ['Bar phone for transfers', '+30 24…'],
      openingHours: ['Opening hours', 'e.g. Daily 10:00–20:00'],
      umbrellaPrice: ['Umbrella / sunbed price', 'e.g. €15 with 2 sunbeds'],
      holdPolicy: ['How long a booked umbrella is held', 'e.g. until 12:00'],
      extraInfo: ['Other information', 'parking, pets, events…'],
      peoplePerUmbrella: ['People per umbrella'],
      maxDaysAhead: ['Bookings up to (days ahead)'],
      seasonStart: ['Season starts (every year)'],
      seasonEnd: ['Season ends (every year)'],
      closedDates: ['Closed days', 'YYYY-MM-DD, comma-separated'],
      greeting: ['Greeting at the start of the call'],
    },
    noSeason: 'no limit',
    voice: 'Advanced settings',
    save: 'Save',
    saved: 'Saved',
    calls: 'Recent calls',
    noCalls: 'No calls yet.',
    test: 'test',
    withheld: 'withheld',
  },
}

const when = (iso, lang) =>
  new Intl.DateTimeFormat(lang === 'el' ? 'el-GR' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))

const LABEL = 'block text-sm font-medium text-ink mb-1.5'

// A day of the year with no year: stored as "MM-DD", empty for no limit.
function MonthDay({ label, value, onChange, lang, none }) {
  const [m, d] = value ? value.split('-') : ['', '']
  const months = Array.from({ length: 12 }, (_, i) =>
    new Intl.DateTimeFormat(lang === 'el' ? 'el-GR' : 'en-GB', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, i, 15)))
  )
  const daysIn = m ? new Date(Date.UTC(2000, Number(m), 0)).getUTCDate() : 31
  const pad = (n) => String(n).padStart(2, '0')
  const cls = 'field !px-2.5'
  return (
    <div className="block min-w-0">
      <span className={LABEL}>{label}</span>
      <div className="flex gap-1.5 min-w-0">
        <select
          className={`${cls} w-16 shrink-0`}
          value={d || ''}
          disabled={!m}
          onChange={(e) => onChange(`${m}-${e.target.value}`)}
          aria-label={`${label} — day`}
        >
          {!m && <option value="">—</option>}
          {Array.from({ length: daysIn }, (_, i) => (
            <option key={i} value={pad(i + 1)}>
              {i + 1}
            </option>
          ))}
        </select>
        <select
          className={`${cls} flex-1 min-w-0`}
          value={m || ''}
          onChange={(e) => {
            const nm = e.target.value
            if (!nm) return onChange('')
            const max = new Date(Date.UTC(2000, Number(nm), 0)).getUTCDate()
            onChange(`${nm}-${pad(Math.min(Number(d || 1), max))}`)
          }}
          aria-label={`${label} — month`}
        >
          <option value="">{none}</option>
          {months.map((name, i) => (
            <option key={i} value={pad(i + 1)}>
              {name}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

function CallRow({ call, t, lang }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-line last:border-0">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 py-2.5 text-left">
        <span className="text-xs text-fog tnum w-28 shrink-0">{when(call.started_at, lang)}</span>
        <span className="text-sm font-medium tnum flex-1 truncate">
          {call.from_number || t.withheld}
          {call.is_test ? <span className="ml-2 text-[11px] bg-sun-tint text-sun rounded-full px-2 py-0.5">{t.test}</span> : null}
        </span>
        <span className="text-xs text-fog truncate max-w-[45%]">{call.outcome || '…'}</span>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={16} className="text-fog" />
      </button>
      {open && (
        <div className="pb-3 space-y-1.5">
          {call.transcript.map((e, i) =>
            e.who === 'event' ? (
              <div key={i} className="text-xs text-fog pl-2">
                · {e.text}
              </div>
            ) : (
              <div key={i} className={`text-sm ${e.who === 'caller' ? 'text-sea-deep font-medium' : 'text-ink'}`}>
                <Icon name={e.who === 'caller' ? 'phone' : 'bot'} size={14} className="inline -mt-0.5 mr-1.5 text-fog" label={e.who === 'caller' ? 'Caller' : 'Agent'} />
                {e.text}
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}

export default function VoicePanel({ lang }) {
  const t = T[lang]
  const [settings, setSettings] = useState(null)
  const [status, setStatus] = useState(null)
  const [calls, setCalls] = useState([])
  const [messages, setMessages] = useState([])
  const [savedMsg, setSavedMsg] = useState('')
  const [copied, setCopied] = useState(false)
  const [showVoice, setShowVoice] = useState(false)
  const [showSetup, setShowSetup] = useState(false)
  const [voices, setVoices] = useState([])
  const [trying, setTrying] = useState(false)

  const loadLists = useCallback(() => {
    api('/voice/calls').then(setCalls).catch(() => {})
    api('/voice/messages').then(setMessages).catch(() => {})
  }, [])

  useEffect(() => {
    api('/voice/settings')
      .then((d) => {
        setSettings(d.settings)
        setStatus(d.status)
        if (d.status.hasElevenKey) api('/voice/eleven-voices').then(setVoices).catch(() => {})
      })
      .catch(() => {})
    loadLists()
    const socket = getSocket()
    const onChanged = ({ type }) => (type === 'voice' || type === 'bookings') && loadLists()
    socket.on('changed', onChanged)
    return () => socket.off('changed', onChanged)
  }, [loadLists])

  const save = async (patch) => {
    try {
      const d = await api('/voice/settings', { method: 'PUT', body: patch || settings })
      setSettings(d.settings)
      setStatus(d.status)
      setSavedMsg(t.saved)
      setTimeout(() => setSavedMsg(''), 3000)
    } catch (e) {
      alert(e.message)
    }
  }

  if (!settings) return null
  const set = (k) => (e) => setSettings({ ...settings, [k]: e.target.value })
  const inputCls = 'field'
  const field = (k, type = 'text') => (
    <label key={k} className="block min-w-0">
      <span className={LABEL}>{t.f[k][0]}</span>
      <input type={type} className={inputCls} placeholder={t.f[k][1] || ''} value={settings[k] ?? ''} onChange={set(k)} />
    </label>
  )
  const section = (title, children) => (
    <fieldset className="space-y-4">
      <legend className="text-xs font-medium uppercase tracking-wider text-fog mb-3">{title}</legend>
      {children}
    </fieldset>
  )
  // Speak a Greek sample with the voice currently picked (saved first, so
  // the server uses it).
  const tryVoice = async () => {
    setTrying(true)
    try {
      await api('/voice/settings', { method: 'PUT', body: { elevenVoiceId: settings.elevenVoiceId } })
      const r = await fetch('/api/voice/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: t.voiceSample, lang: 'el' }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`)
      const url = URL.createObjectURL(await r.blob())
      const a = new Audio(url)
      a.onended = () => URL.revokeObjectURL(url)
      await a.play()
    } catch (e) {
      alert(e.message)
    } finally {
      setTrying(false)
    }
  }
  const open = messages.filter((m) => !m.handled)
  const chip = (ok, label, quiet = false) => (
    <span
      key={label}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 h-7 text-xs font-medium ${
        ok ? 'bg-palm-tint text-palm-deep' : quiet ? 'bg-sand text-fog' : 'bg-coral-tint text-coral'
      }`}
      title={`${label}: ${ok ? t.on : t.off}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-palm' : quiet ? 'bg-fog/60' : 'bg-coral'}`} aria-hidden="true" />
      {label}
      <span className="sr-only">: {ok ? t.on : t.off}</span>
    </span>
  )

  return (
    <div className="space-y-5">
      {/* On/off and what's connected — one quiet row */}
      <section className="card px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <button
              type="button"
              role="switch"
              aria-checked={settings.agentEnabled}
              onClick={() => save({ agentEnabled: !settings.agentEnabled })}
              className={`relative w-11 h-6 rounded-full transition-colors ${settings.agentEnabled ? 'bg-palm' : 'bg-line'}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${settings.agentEnabled ? 'translate-x-5' : ''}`}
              />
            </button>
            <span>
              <span className="block text-sm font-medium">{t.enabled}</span>
              {!settings.agentEnabled && <span className="block text-xs text-fog">{t.disabledNote}</span>}
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            {chip(status?.hasClaudeKey, t.chipClaude)}
            {chip(status?.hasElevenKey, t.chipEleven, true)}
            {chip(status?.hasTwilioToken, t.chipLine, true)}
            <button
              type="button"
              onClick={() => setShowSetup(!showSetup)}
              aria-expanded={showSetup}
              className="inline-flex items-center gap-1 h-7 px-2 rounded-full text-xs font-medium text-sea hover:bg-sea-tint transition-colors"
            >
              {t.setup}
              <Icon name={showSetup ? 'chevronUp' : 'chevronDown'} size={14} />
            </button>
          </div>
        </div>
        {showSetup && (
          <div className="mt-3 pt-3 border-t border-line space-y-2">
            <p className="text-sm text-fog">{t.setupHint}</p>
            <div className="flex gap-2">
              <code className="flex-1 min-w-0 bg-sand rounded-lg px-3 py-2 text-xs break-all">{status?.webhookUrl}</code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(status?.webhookUrl || '')
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }}
                className="btn btn-quiet !min-h-9 !px-3 text-xs font-medium"
              >
                {copied ? t.copied : t.copy}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* On a computer the left column sets the height; the agent's facts
          fill exactly that height and scroll inside, so both sides end level. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        <div className="min-w-0 flex flex-col gap-5">
          {/* Callback messages — amber when someone is waiting */}
          <section className={`rounded-2xl border p-5 ${open.length ? 'bg-sun-tint border-sun-bright' : 'card'}`}>
            <h3 className="text-base font-semibold flex items-center gap-2">
              {t.messages}
              {open.length > 0 && <span className="bg-sun-bright text-night rounded-full px-2 h-5 leading-5 text-xs font-semibold tnum">{open.length}</span>}
            </h3>
            {messages.length === 0 && <p className="text-sm text-fog mt-1">{t.noMessages}</p>}
            <div className="space-y-2 mt-3 empty:hidden">
              {messages.map((m) => (
                <div key={m.id} className={`bg-shell rounded-xl border border-line p-3 ${m.handled ? 'opacity-50' : ''}`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-sm">
                      {m.name || '—'}{' '}
                      {m.phone && (
                        <a href={`tel:${m.phone}`} className="text-sea-deep underline underline-offset-2 tnum">
                          {m.phone}
                        </a>
                      )}
                    </span>
                    <span className="text-xs text-fog tnum">{when(m.created_at, lang)}</span>
                  </div>
                  <p className="text-sm mt-1">{m.message}</p>
                  <button
                    onClick={() => api(`/voice/messages/${m.id}`, { method: 'PATCH', body: { handled: !m.handled } }).then(loadLists)}
                    className={`mt-2 rounded-lg px-3 h-8 text-xs font-medium ${m.handled ? 'border border-line text-fog' : 'bg-palm text-white hover:bg-palm-deep'}`}
                  >
                    {m.handled ? t.reopen : t.done}
                  </button>
                </div>
              ))}
            </div>
          </section>

          <VoiceTester lang={lang} greeting={settings.greeting} eleven={!!status?.hasElevenKey} className="flex-1" />
        </div>

        <div className="relative min-w-0 lg:min-h-[40rem]">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
            className="card flex flex-col max-h-[75dvh] lg:max-h-none lg:absolute lg:inset-0"
          >
            {/* Title and Save stay put; only the facts in between scroll */}
            <div className="px-5 pt-5 pb-4 border-b border-line">
              <h3 className="text-base font-semibold">{t.settings}</h3>
              <p className="text-sm text-fog mt-1">{t.settingsHint}</p>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-5 space-y-7">
              {section(
                t.secBar,
                <>
                  {field('openingHours')}
                  {field('umbrellaPrice')}
                  {field('holdPolicy')}
                  <label className="block">
                    <span className={LABEL}>{t.f.extraInfo[0]}</span>
                    <textarea rows={3} className={inputCls} placeholder={t.f.extraInfo[1]} value={settings.extraInfo} onChange={set('extraInfo')} />
                  </label>
                </>
              )}
              {section(
                t.secBookings,
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {field('peoplePerUmbrella', 'number')}
                    {field('maxDaysAhead', 'number')}
                    <MonthDay label={t.f.seasonStart[0]} value={settings.seasonStart} onChange={(v) => setSettings({ ...settings, seasonStart: v })} lang={lang} none={t.noSeason} />
                    <MonthDay label={t.f.seasonEnd[0]} value={settings.seasonEnd} onChange={(v) => setSettings({ ...settings, seasonEnd: v })} lang={lang} none={t.noSeason} />
                  </div>
                  {field('closedDates')}
                </>
              )}
              {section(
                t.secCall,
                <>
                  {field('greeting')}
                  {field('transferNumber', 'tel')}
                  {status?.hasElevenKey && (
                    <div>
                      <label className="block">
                        <span className={LABEL}>{t.voicePick}</span>
                        <div className="flex gap-2">
                          <select className={`${inputCls} flex-1 min-w-0`} value={settings.elevenVoiceId} onChange={set('elevenVoiceId')}>
                            <option value="">{t.voiceAuto}</option>
                            {voices.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.name}
                                {v.labels.gender ? ` · ${v.labels.gender}` : ''}
                                {v.labels.accent ? ` · ${v.labels.accent}` : ''}
                              </option>
                            ))}
                          </select>
                          <button type="button" onClick={tryVoice} disabled={trying} className="btn btn-quiet shrink-0 text-sm font-medium disabled:opacity-50">
                            <Icon name="speaker" size={16} />
                            {trying ? '…' : t.voiceTry}
                          </button>
                        </div>
                      </label>
                      <p className="text-xs text-fog mt-1.5">{t.voiceHint}</p>
                    </div>
                  )}
                  <button type="button" onClick={() => setShowVoice(!showVoice)} aria-expanded={showVoice} className="inline-flex items-center gap-1 text-sm font-medium text-fog hover:text-ink">
                    {t.voice}
                    <Icon name={showVoice ? 'chevronUp' : 'chevronDown'} size={16} />
                  </button>
                  {showVoice && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {['elevenModel', 'ttsProvider', 'voiceEl', 'voiceEn', 'transcriptionProvider', 'speechModel'].map((k) => (
                        <label key={k} className="block min-w-0">
                          <span className={LABEL}>{k}</span>
                          <input className={inputCls} value={settings[k] ?? ''} onChange={set(k)} />
                        </label>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="px-5 py-4 border-t border-line flex items-center gap-3">
              <button className="btn btn-primary px-6 font-medium">{t.save}</button>
              {savedMsg && (
                <span role="status" className="text-sm font-medium text-palm-deep flex items-center gap-1.5">
                  <Icon name="check" size={18} />
                  {savedMsg}
                </span>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* Call log */}
      <section className="card p-5">
        <h3 className="text-base font-semibold mb-1">{t.calls}</h3>
        {calls.length === 0 && <p className="text-sm text-fog">{t.noCalls}</p>}
        {calls.map((c) => (
          <CallRow key={c.id} call={c} t={t} lang={lang} />
        ))}
      </section>
    </div>
  )
}
