const db = require('../db')
const B = require('../bookings')

// The phone agent's tools. Claude decides when to call them; this file
// decides what is allowed. Every input is validated here — the request
// streams tool inputs eagerly, so nothing upstream has checked them.

const ROWS = ['front', 'middle', 'back', 'any']

const TOOLS = [
  {
    name: 'check_availability',
    description:
      'Check how many umbrellas are free on a date, and whether that date can be booked at all (season, closed days, how far ahead). Call this before offering or creating a booking.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD, resolved from the call context calendar' },
        umbrellas: { type: 'integer', description: 'How many umbrellas the group needs (default 1)' },
      },
      required: ['date'],
    },
  },
  {
    name: 'create_booking',
    description:
      'Reserve umbrellas for a day. Only call after the caller has confirmed the date, name, party size and phone number out loud. Returns the booking code to read back.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD' },
        name: { type: 'string', description: 'Name the booking is under' },
        party_size: { type: 'integer', description: 'Number of people' },
        umbrellas: {
          type: 'integer',
          description: 'Umbrellas to hold. Omit to derive from party size and the people-per-umbrella rule.',
        },
        row_preference: { type: 'string', enum: ROWS, description: 'front = by the sea' },
        phone: {
          type: 'string',
          description: "Contact number. Omit to use the caller's own number (caller ID).",
        },
        arrival_time: { type: 'string', description: 'Rough arrival time if the caller gave one, e.g. 11:00' },
        notes: { type: 'string', description: 'Anything staff should know (birthday, accessibility...)' },
      },
      required: ['date', 'name', 'party_size'],
    },
  },
  {
    name: 'lookup_bookings',
    description:
      "Find the caller's upcoming bookings. With a booking code, returns that booking; without one, returns bookings made from the caller's own phone number.",
    input_schema: {
      type: 'object',
      properties: { code: { type: 'string', description: 'The booking code, if the caller has it' } },
    },
  },
  {
    name: 'cancel_booking',
    description:
      "Cancel a booking by its code. Allowed when the booking was made from the caller's number, or when the caller gives the name the booking is under. Confirm with the caller before cancelling.",
    input_schema: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        name: { type: 'string', description: 'Name the caller says the booking is under' },
      },
      required: ['code'],
    },
  },
  {
    name: 'get_menu',
    description: 'The current menu with prices and what is sold out. Use when callers ask about food or drinks.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'take_message',
    description:
      'Leave a note for the staff to call the person back — for questions you cannot answer, special requests, groups, events, complaints.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        phone: { type: 'string', description: "Omit to use the caller's own number" },
        message: { type: 'string', description: 'What they need, in a sentence or two' },
      },
      required: ['message'],
    },
  },
  {
    name: 'transfer_to_staff',
    description:
      'Put the caller through to a person at the bar. Use when they ask for a human, or when you cannot help and they would rather not leave a message. Call it first; then, in your reply, tell the caller in one short sentence that you are putting them through. The transfer happens when you finish speaking.',
    input_schema: {
      type: 'object',
      properties: { reason: { type: 'string' } },
      required: ['reason'],
    },
  },
  {
    name: 'set_language',
    description: 'Switch the call to Greek or English (speech recognition and voice). Use as soon as the caller prefers the other language.',
    input_schema: {
      type: 'object',
      properties: { language: { type: 'string', enum: ['el', 'en'] } },
      required: ['language'],
    },
  },
  {
    name: 'end_call',
    description:
      'End the call when the caller has nothing else. Call it first; then, in your reply, say a short goodbye. The line closes when you finish speaking.',
    input_schema: { type: 'object', properties: {} },
  },
].map((t) => ({ ...t, eager_input_streaming: true }))

// ---- validation helpers ----

class ToolInputError extends Error {}

const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
function int(v, { min, max, fallback }) {
  const n = typeof v === 'number' ? v : parseInt(v, 10)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}
function requireDate(v) {
  const d = str(v, 10)
  if (!B.isValidDate(d)) throw new ToolInputError('date must be YYYY-MM-DD')
  return d
}

// Can this date be booked at all? Returns null when fine, else a reason.
function dateProblem(date, settings) {
  const today = B.athensDate()
  if (date < today) return 'That date has already passed.'
  const ahead = B.daysBetween(today, date)
  if (settings.maxDaysAhead > 0 && ahead > settings.maxDaysAhead) {
    return `Bookings open at most ${settings.maxDaysAhead} days ahead.`
  }
  if (!B.inSeason(date, settings.seasonStart, settings.seasonEnd)) return `That's outside the season (${seasonText(settings)}).`
  const closed = settings.closedDates.split(',').map((s) => s.trim())
  if (closed.includes(date)) return 'The bar is closed that day.'
  return null
}

function seasonText(settings) {
  const { seasonStart: s, seasonEnd: e } = settings
  if (s && e) return `open from ${B.monthDayText(s)} to ${B.monthDayText(e)} every year`
  if (s) return `opens on ${B.monthDayText(s)} every year`
  if (e) return `closes after ${B.monthDayText(e)} every year`
  return 'open all year'
}

function umbrellasFor(partySize, settings) {
  return Math.max(1, Math.ceil(partySize / Math.max(1, settings.peoplePerUmbrella)))
}

function bookingView(b) {
  return {
    code: b.code,
    date: b.date,
    weekday: B.weekday(b.date),
    name: b.name,
    party_size: b.party_size,
    umbrellas: b.umbrellas,
    arrival_time: b.arrival_time || undefined,
    status: b.status,
  }
}

// ---- executors ----
// ctx: { callerNumber, callId, settings, notify, onLanguage, onTransfer, onEnd }

const EXEC = {
  check_availability(input, ctx) {
    const date = requireDate(input.date)
    const need = int(input.umbrellas, { min: 1, max: 12, fallback: 1 })
    const problem = dateProblem(date, ctx.settings)
    if (problem) return { date, weekday: B.weekday(date), bookable: false, reason: problem }
    const a = B.availability(date)
    const together = need > 1 ? !!B.pickSpots(date, need, 'any') : undefined
    return {
      date,
      weekday: B.weekday(date),
      bookable: a.free >= need,
      free_umbrellas: a.free,
      free_by_row: a.freeByRow,
      group_fits: together,
      people_per_umbrella: ctx.settings.peoplePerUmbrella,
    }
  },

  create_booking(input, ctx) {
    const date = requireDate(input.date)
    const name = str(input.name, 80)
    if (!name) throw new ToolInputError('name is required')
    const partySize = int(input.party_size, { min: 1, max: 60, fallback: 0 })
    if (!partySize) throw new ToolInputError('party_size is required')
    const problem = dateProblem(date, ctx.settings)
    if (problem) return { ok: false, reason: problem }
    const count = input.umbrellas == null ? umbrellasFor(partySize, ctx.settings) : int(input.umbrellas, { min: 1, max: 12, fallback: 1 })
    const preference = ROWS.includes(input.row_preference) ? input.row_preference : 'any'
    const phone = str(input.phone, 30) || ctx.callerNumber
    try {
      const b = B.createBooking({
        date,
        name,
        phone,
        partySize,
        count,
        preference,
        arrivalTime: str(input.arrival_time, 20),
        notes: str(input.notes, 300),
        source: ctx.isTest ? 'voice-test' : 'phone',
        createdBy: 'voice agent',
      })
      ctx.notify('bookings', 'booking_created', { date })
      ctx.log({ booking: b.code })
      return { ok: true, booking: bookingView(b), phone_on_booking: b.phone }
    } catch (e) {
      if (e instanceof B.BookingError) return { ok: false, reason: e.message }
      throw e
    }
  },

  lookup_bookings(input, ctx) {
    const code = str(input.code, 10).replace(/\D/g, '')
    if (code) {
      const b = B.getBookingByCode(code)
      if (!b || b.date < B.athensDate()) return { found: false }
      return { found: true, bookings: [bookingView(b)] }
    }
    const list = B.upcomingForPhone(ctx.callerNumber)
    return { found: list.length > 0, from_caller_number: true, bookings: list.map(bookingView) }
  },

  cancel_booking(input, ctx) {
    const code = str(input.code, 10).replace(/\D/g, '')
    if (!code) throw new ToolInputError('code is required')
    const b = B.getBookingByCode(code)
    if (!b || b.status === 'cancelled') return { ok: false, reason: 'No active booking with that code.' }
    if (b.date < B.athensDate()) return { ok: false, reason: 'That booking is in the past.' }
    const sayName = str(input.name, 80).toLowerCase()
    const nameOk =
      sayName.length >= 2 && (b.name.toLowerCase().includes(sayName) || sayName.includes(b.name.toLowerCase()))
    if (!B.samePhone(b.phone, ctx.callerNumber) && !nameOk) {
      return {
        ok: false,
        reason: "Can't verify: the booking wasn't made from this number. Ask for the name it is under and try again.",
      }
    }
    B.cancelBooking(b.id)
    ctx.notify('bookings', 'booking_cancelled', { date: b.date })
    ctx.log({ cancelled: b.code })
    return { ok: true, cancelled: bookingView({ ...b, status: 'cancelled' }) }
  },

  get_menu() {
    const items = db.prepare('SELECT name, name_el, price, category, available FROM menu_items ORDER BY sort, id').all()
    return {
      items: items.map((m) => ({
        name: m.name,
        name_el: m.name_el || undefined,
        category: m.category,
        price_eur: m.price,
        sold_out: m.available ? undefined : true,
      })),
    }
  },

  take_message(input, ctx) {
    const message = str(input.message, 600)
    if (!message) throw new ToolInputError('message is required')
    db.prepare('INSERT INTO voice_messages (call_id, name, phone, message, created_at) VALUES (?, ?, ?, ?, ?)').run(
      ctx.callId,
      str(input.name, 80),
      B.normalizePhone(str(input.phone, 30) || ctx.callerNumber),
      message,
      new Date().toISOString()
    )
    ctx.notify('voice', 'message_left')
    ctx.log({ message: true })
    return { ok: true }
  },

  transfer_to_staff(input, ctx) {
    if (!ctx.settings.transferNumber) {
      return { ok: false, reason: 'No staff line is set up. Offer to take a message instead.' }
    }
    ctx.onTransfer(str(input.reason, 200))
    return { ok: true, note: 'Now tell the caller in one short sentence that you are putting them through.' }
  },

  set_language(input, ctx) {
    const lang = input.language === 'en' ? 'en' : input.language === 'el' ? 'el' : null
    if (!lang) throw new ToolInputError('language must be el or en')
    ctx.onLanguage(lang)
    return { ok: true, language: lang }
  },

  end_call(input, ctx) {
    ctx.onEnd()
    return { ok: true, note: 'Now say a short goodbye.' }
  },
}

// Runs one tool call; always returns a tool_result-ready { content, isError }.
function runTool(name, input, ctx) {
  const exec = EXEC[name]
  if (!exec) return { content: JSON.stringify({ error: `Unknown tool ${name}` }), isError: true }
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { content: JSON.stringify({ error: 'INVALID_JSON: input must be an object' }), isError: true }
  }
  try {
    return { content: JSON.stringify(exec(input, ctx)), isError: false }
  } catch (e) {
    if (e instanceof ToolInputError) {
      return { content: JSON.stringify({ error: `INVALID_INPUT: ${e.message}` }), isError: true }
    }
    console.error(`[voice] tool ${name} failed:`, e)
    return { content: JSON.stringify({ error: 'Internal error — apologise and offer to take a message.' }), isError: true }
  }
}

module.exports = { TOOLS, runTool, dateProblem, umbrellasFor, seasonText }
