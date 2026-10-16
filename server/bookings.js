const crypto = require('crypto')
const db = require('./db')

// Umbrella reservations. Used by both the staff screens and the phone agent,
// so every rule (dates in Greek time, no double-booking, groups seated
// together) lives here once.

const TZ = 'Europe/Athens'

// YYYY-MM-DD for "now" (or a given instant) on the beach's calendar, not the
// server's — the VPS runs on UTC, and 01:30 in Afissos is still "yesterday" there.
function athensDate(at = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
}

function athensTime(at = new Date()) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(at)
}

function isValidDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return false
  const d = new Date(`${s}T12:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

function addDays(date, n) {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function daysBetween(a, b) {
  return Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86400e3)
}

function weekday(date, lang = 'en') {
  return new Intl.DateTimeFormat(lang === 'el' ? 'el-GR' : 'en-GB', { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(`${date}T12:00:00Z`)
  )
}

// "05-01" → "1 May" (a leap year, so 02-29 is a real day).
function monthDayText(md, lang = 'en') {
  return new Intl.DateTimeFormat(lang === 'el' ? 'el-GR' : 'en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    new Date(`2000-${md}T12:00:00Z`)
  )
}

// True when a YYYY-MM-DD falls inside a yearly season given as MM-DD bounds.
// Either bound may be empty; a season that crosses New Year (start after end) wraps.
function inSeason(date, start, end) {
  const md = date.slice(5)
  if (start && end) return start <= end ? md >= start && md <= end : md >= start || md <= end
  if (start) return md >= start
  if (end) return md <= end
  return true
}

function longDate(date, lang = 'en') {
  return new Intl.DateTimeFormat(lang === 'el' ? 'el-GR' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`))
}

// Phone numbers arrive as caller ID (+306912345678) or spoken digits
// ("69 1234 5678"). Compare on the last 10 digits so both forms match.
function normalizePhone(raw) {
  const s = String(raw || '').trim()
  const digits = s.replace(/\D/g, '')
  if (!digits) return ''
  if (s.startsWith('+')) return `+${digits}`
  if (digits.startsWith('00')) return `+${digits.slice(2)}`
  if (digits.length === 10 && /^[26]/.test(digits)) return `+30${digits}`
  return digits
}

function samePhone(a, b) {
  const da = String(a || '').replace(/\D/g, '')
  const dbb = String(b || '').replace(/\D/g, '')
  return da.length >= 8 && dbb.length >= 8 && da.slice(-10) === dbb.slice(-10)
}

// ---- Beach layout: row letter is the umbrella number's first letter.
// The first row alphabetically is by the sea (A), the last is the back row.

function parseNumber(number) {
  const m = /^([A-Za-z])(\d{1,2})$/.exec(number || '')
  return m ? { row: m[1].toUpperCase(), col: parseInt(m[2], 10) } : null
}

function layout() {
  const umbrellas = db.prepare('SELECT id, number, zone FROM umbrellas ORDER BY number').all()
  const rows = [...new Set(umbrellas.map((u) => parseNumber(u.number)?.row).filter(Boolean))].sort()
  return { umbrellas, rows }
}

function rowRole(row, rows) {
  if (rows.length === 0) return 'any'
  if (row === rows[0]) return 'front'
  if (row === rows[rows.length - 1]) return 'back'
  return 'middle'
}

const takenStmt = db.prepare('SELECT umbrella_id FROM booking_spots WHERE date = ?')

function freeUmbrellas(date) {
  const taken = new Set(takenStmt.all(date).map((r) => r.umbrella_id))
  return layout().umbrellas.filter((u) => !taken.has(u.id))
}

function availability(date) {
  const { umbrellas, rows } = layout()
  const free = freeUmbrellas(date)
  const byRole = { front: 0, middle: 0, back: 0 }
  for (const u of free) {
    const p = parseNumber(u.number)
    const role = p ? rowRole(p.row, rows) : 'back'
    byRole[role] = (byRole[role] || 0) + 1
  }
  return { date, total: umbrellas.length, free: free.length, freeByRow: byRole }
}

// Choose `count` free umbrellas, preferring the requested row and keeping a
// group side by side (same row, same block — 1-5 and 6-12 are split by the
// walkway). Falls back to any free umbrellas when no adjacent run exists.
function pickSpots(date, count, preference = 'any') {
  const { rows } = layout()
  const free = freeUmbrellas(date)
    .map((u) => ({ ...u, p: parseNumber(u.number) }))
    .filter((u) => u.p)
  const roleOrder = {
    front: ['front', 'middle', 'back'],
    middle: ['middle', 'front', 'back'],
    back: ['back', 'middle', 'front'],
    any: ['front', 'middle', 'back'],
  }[preference] || ['front', 'middle', 'back']
  const rank = (u) => roleOrder.indexOf(rowRole(u.p.row, rows))
  free.sort((a, b) => rank(a) - rank(b) || a.p.row.localeCompare(b.p.row) || a.p.col - b.p.col)
  if (free.length < count) return null
  if (count === 1) return [free[0]]

  const block = (col) => (col <= 5 ? 'L' : 'R')
  for (let i = 0; i + count <= free.length; i++) {
    const run = free.slice(i, i + count)
    const sameRow = run.every((u) => u.p.row === run[0].p.row && block(u.p.col) === block(run[0].p.col))
    const consecutive = run.every((u, k) => k === 0 || u.p.col === run[k - 1].p.col + 1)
    if (sameRow && consecutive) return run
  }
  return free.slice(0, count)
}

function newCode() {
  // 4 digits: easy to say on the phone, and checked for uniqueness.
  const exists = db.prepare('SELECT 1 FROM bookings WHERE code = ?')
  for (let i = 0; i < 50; i++) {
    const code = String(crypto.randomInt(1000, 10000))
    if (!exists.get(code)) return code
  }
  return String(crypto.randomInt(100000, 1000000))
}

const spotsOfStmt = db.prepare(`
  SELECT u.id, u.number, u.zone FROM booking_spots s JOIN umbrellas u ON u.id = s.umbrella_id
  WHERE s.booking_id = ? ORDER BY u.number
`)

function withSpots(b) {
  if (!b) return b
  const spots = spotsOfStmt.all(b.id)
  return { ...b, umbrellas: spots.map((s) => s.number), umbrella_ids: spots.map((s) => s.id) }
}

class BookingError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

// Creates a confirmed booking. Either `umbrellaNumbers` (staff picked spots on
// the map) or `count` + `preference` (auto-assign) decides the spots.
function createBooking({
  date,
  name,
  phone = '',
  partySize = 1,
  count = 1,
  preference = 'any',
  umbrellaNumbers = null,
  arrivalTime = '',
  notes = '',
  source = 'staff',
  createdBy = '',
}) {
  if (!isValidDate(date)) throw new BookingError('bad_date', 'Date must be YYYY-MM-DD')
  if (date < athensDate()) throw new BookingError('past_date', 'That date has already passed')
  const cleanName = String(name || '').trim().slice(0, 80)
  if (!cleanName) throw new BookingError('no_name', 'A name is required')
  const n = Math.max(1, Math.min(12, parseInt(count, 10) || 1))

  const run = db.transaction(() => {
    let spots
    if (Array.isArray(umbrellaNumbers) && umbrellaNumbers.length > 0) {
      const free = new Map(freeUmbrellas(date).map((u) => [u.number.toUpperCase(), u]))
      spots = umbrellaNumbers.map((num) => {
        const u = free.get(String(num).toUpperCase())
        if (!u) throw new BookingError('spot_taken', `Umbrella ${num} is not free on ${date}`)
        return u
      })
    } else {
      spots = pickSpots(date, n, preference)
      if (!spots) throw new BookingError('full', `Not enough free umbrellas on ${date}`)
    }
    const info = db
      .prepare(
        `INSERT INTO bookings (code, date, name, phone, party_size, arrival_time, notes, source, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        newCode(),
        date,
        cleanName,
        normalizePhone(phone),
        Math.max(1, Math.min(60, parseInt(partySize, 10) || 1)),
        String(arrivalTime || '').slice(0, 20),
        String(notes || '').slice(0, 300),
        source,
        String(createdBy || '').slice(0, 50),
        new Date().toISOString()
      )
    const insertSpot = db.prepare('INSERT INTO booking_spots (booking_id, umbrella_id, date) VALUES (?, ?, ?)')
    for (const u of spots) insertSpot.run(info.lastInsertRowid, u.id, date)
    return info.lastInsertRowid
  })

  try {
    return getBooking(run())
  } catch (e) {
    // Two bookings racing for the same umbrella: the unique index wins.
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE' || e.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
      throw new BookingError('spot_taken', 'That umbrella was just taken — try again')
    }
    throw e
  }
}

function getBooking(id) {
  return withSpots(db.prepare('SELECT * FROM bookings WHERE id = ?').get(id))
}

function getBookingByCode(code) {
  return withSpots(db.prepare('SELECT * FROM bookings WHERE code = ?').get(String(code || '').replace(/\D/g, '')))
}

function cancelBooking(id) {
  const b = getBooking(id)
  if (!b) throw new BookingError('not_found', 'Booking not found')
  if (b.status === 'cancelled') return b
  db.transaction(() => {
    db.prepare(`UPDATE bookings SET status = 'cancelled', cancelled_at = ? WHERE id = ?`).run(new Date().toISOString(), id)
    db.prepare('DELETE FROM booking_spots WHERE booking_id = ?').run(id)
  })()
  return getBooking(id)
}

function setArrived(id, arrived) {
  const b = getBooking(id)
  if (!b) throw new BookingError('not_found', 'Booking not found')
  if (b.status === 'cancelled') throw new BookingError('cancelled', 'Booking was cancelled')
  db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(arrived ? 'arrived' : 'confirmed', id)
  return getBooking(id)
}

function listBookings(date) {
  return db
    .prepare(`SELECT * FROM bookings WHERE date = ? ORDER BY status = 'cancelled', created_at`)
    .all(date)
    .map(withSpots)
}

// Upcoming (today onwards), not cancelled, for a phone number.
function upcomingForPhone(phone) {
  if (!String(phone || '').replace(/\D/g, '')) return []
  return db
    .prepare(`SELECT * FROM bookings WHERE date >= ? AND status != 'cancelled' ORDER BY date`)
    .all(athensDate())
    .filter((b) => samePhone(b.phone, phone))
    .map(withSpots)
}

function reservedIds(date) {
  return takenStmt.all(date).map((r) => r.umbrella_id)
}

module.exports = {
  TZ,
  athensDate,
  athensTime,
  isValidDate,
  addDays,
  daysBetween,
  weekday,
  longDate,
  monthDayText,
  inSeason,
  normalizePhone,
  samePhone,
  availability,
  pickSpots,
  createBooking,
  getBooking,
  getBookingByCode,
  cancelBooking,
  setArrived,
  listBookings,
  upcomingForPhone,
  reservedIds,
  BookingError,
}
