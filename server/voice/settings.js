const db = require('../db')

// Everything the manager can change about the phone agent, stored as one JSON
// value in the meta table. Business facts start EMPTY on purpose: when one is
// missing the agent says it doesn't know and offers to take a message —
// it never makes up hours or prices.
const DEFAULTS = {
  agentEnabled: true,
  // The bar's own phone, in international format (+3024...). Callers who ask
  // for a person, or calls the agent can't handle, are put through here.
  transferNumber: '',

  // Booking rules
  peoplePerUmbrella: 2,
  maxDaysAhead: 30,
  seasonStart: '', // MM-DD, every year — no bookings before this day
  seasonEnd: '', // MM-DD, every year — no bookings after this day
  closedDates: '', // comma-separated YYYY-MM-DD

  // Facts the agent may tell callers (free text, Greek or English)
  openingHours: '',
  umbrellaPrice: '',
  holdPolicy: '', // e.g. how long a reserved umbrella is kept for late arrivals
  extraInfo: '', // parking, pets, events, anything else worth knowing

  // Voice. ElevenLabs speaks for the browser test phone and (when hosted) for
  // Twilio phone calls; the same voice is used in Greek and English.
  // Spoken the moment a phone call connects (in Greek; 2 switches to English).
  greeting: 'Slam Bar, γεια σας! Πώς μπορώ να σας βοηθήσω; For English, press 2.',
  elevenVoiceId: '', // empty = pick automatically from the ElevenLabs account
  elevenModel: 'eleven_flash_v2_5',
  ttsProvider: 'ElevenLabs',
  voiceEl: '', // empty = the ElevenLabs voice above
  voiceEn: '',
  transcriptionProvider: 'Deepgram',
  speechModel: 'nova-3-general',
}

const KEY = 'voice_settings'

function getSettings() {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(KEY)
  let saved = {}
  try {
    saved = row ? JSON.parse(row.value) : {}
  } catch {
    saved = {}
  }
  const merged = { ...DEFAULTS, ...saved }
  merged.seasonStart = toMonthDay(merged.seasonStart)
  merged.seasonEnd = toMonthDay(merged.seasonEnd)
  return merged
}

const MONTH_DAY = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

// The season repeats every year, so it is stored as MM-DD. A full date saved
// before that change keeps its month and day.
function toMonthDay(value) {
  let s = String(value || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s = s.slice(5)
  return MONTH_DAY.test(s) ? s : ''
}

// Accepts a partial update from the manager screen; ignores unknown keys and
// coerces each field to its type so a bad form value can't break calls.
function updateSettings(patch = {}) {
  const next = getSettings()
  for (const [k, def] of Object.entries(DEFAULTS)) {
    if (!(k in patch)) continue
    const v = patch[k]
    if (typeof def === 'boolean') next[k] = !!v
    else if (typeof def === 'number') {
      const n = parseInt(v, 10)
      if (!Number.isNaN(n)) next[k] = n
    } else next[k] = String(v ?? '').slice(0, 1500).trim()
  }
  next.peoplePerUmbrella = Math.max(1, Math.min(10, next.peoplePerUmbrella))
  next.maxDaysAhead = Math.max(0, Math.min(365, next.maxDaysAhead))
  next.seasonStart = toMonthDay(next.seasonStart)
  next.seasonEnd = toMonthDay(next.seasonEnd)
  next.transferNumber = next.transferNumber.replace(/[^\d+]/g, '')
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    KEY,
    JSON.stringify(next)
  )
  return next
}

module.exports = { DEFAULTS, getSettings, updateSettings }
