const express = require('express')
const crypto = require('crypto')
const db = require('./db')
const { hashPin, verifyPin, createSession, readSession } = require('./auth')
const Bookings = require('./bookings')
const { getSettings: getVoiceSettings, updateSettings: updateVoiceSettings } = require('./voice/settings')
const { voiceStatus } = require('./voice/twilio')
const { umbrellasFor } = require('./voice/tools')
const { hasElevenKey, listVoices, speakTo } = require('./voice/elevenlabs')

// The signing secret lives in the database so sessions survive restarts.
// Generated once, never leaves the server.
let SECRET = db.prepare(`SELECT value FROM meta WHERE key = 'session_secret'`).get()?.value
if (!SECRET) {
  SECRET = crypto.randomBytes(32).toString('hex')
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('session_secret', SECRET)
}

const COOKIE = 'slam_session'
const SESSION_MS = 30 * 86400e3 // one season-ish month per login
// Manager sessions are short: the manager role can change PINs, menus and
// see revenue, so a stolen or forgotten-open device must not stay powerful.
const MANAGER_SESSION_MS = 12 * 3600e3

// Brute-force throttle: after 5 wrong PINs from one address the door locks,
// and every 5 more failures doubles the wait (1 min → capped at 15 min).
// In-memory on purpose — restarting the server safely resets it.
const loginFails = new Map() // ip -> { count, until }
function ipOf(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown'
}
function pruneFails() {
  if (loginFails.size < 5000) return
  const now = Date.now()
  for (const [ip, f] of loginFails) if (f.until < now) loginFails.delete(ip)
}

// PINs anyone would try first: one digit repeated (1111), or a run up or
// down (1234, 9876, 012345).
function isWeakPin(pin) {
  const s = String(pin)
  if (/^(\d)\1+$/.test(s)) return true
  const steps = [...s].slice(1).map((d, i) => Number(d) - Number(s[i]))
  return steps.every((x) => x === 1) || steps.every((x) => x === -1)
}

const staffById = db.prepare('SELECT id, name, role, session_version FROM staff_users WHERE id = ?')

// A session is only good while its person still exists and their login
// version matches: deleting someone, or "log out everywhere", ends every
// session they have at once. Name and role always come from the database.
function sessionOf(req) {
  const raw = (req.headers.cookie || '')
    .split(/;\s*/)
    .find((c) => c.startsWith(`${COOKIE}=`))
  const data = readSession(raw ? raw.slice(COOKIE.length + 1) : null, SECRET)
  if (!data) return null
  const staff = staffById.get(data.id)
  if (!staff || staff.session_version !== (data.v ?? 0)) return null
  return { ...data, name: staff.name, role: staff.role }
}

// Gatekeeper: the request must carry a valid session with one of these
// roles. Managers pass everywhere. Applied to sensitive endpoints only —
// guest ordering stays open by design.
function requireRole(...roles) {
  return (req, res, next) => {
    const session = sessionOf(req)
    if (!session) return res.status(401).json({ error: 'Please log in first' })
    if (session.role !== 'manager' && !roles.includes(session.role)) {
      return res.status(403).json({ error: `This needs a ${roles.join(' or ')} login` })
    }
    req.staff = session
    next()
  }
}

const ACTIVE_STATUSES = ['placed', 'accepted', 'ready', 'picked_up']

function todayStart() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

const getUmbrellaByToken = db.prepare('SELECT * FROM umbrellas WHERE token = ?')
const getUmbrellaById = db.prepare('SELECT * FROM umbrellas WHERE id = ?')
const getOrderItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?')
const getOrder = db.prepare(`
  SELECT o.*, u.number AS umbrella_number, u.zone AS umbrella_zone
  FROM orders o JOIN umbrellas u ON u.id = o.umbrella_id WHERE o.id = ?
`)

function withoutToken({ token, ...umbrella }) {
  return umbrella
}

function withItems(order) {
  if (!order) return order
  return { ...order, items: getOrderItems.all(order.id) }
}

module.exports = function createApi(io) {
  const r = express.Router()

  // Broadcast a change so every open screen refreshes the right data.
  const notify = (type, event, payload = {}) => {
    io.emit('changed', { type, event, ...payload })
  }

  // ---------- Customer (via umbrella QR token) ----------

  r.get('/u/:token/bootstrap', (req, res) => {
    const umbrella = getUmbrellaByToken.get(req.params.token)
    if (!umbrella) return res.status(404).json({ error: 'Unknown umbrella' })
    const menu = db.prepare('SELECT * FROM menu_items ORDER BY sort, id').all()
    res.json({
      umbrella: { id: umbrella.id, number: umbrella.number, zone: umbrella.zone },
      menu,
    })
  })

  // Shared by guest QR orders and waiter-taken orders.
  function createOrder(umbrella, body, res) {
    const { items = [], note = '', by = '' } = body || {}
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Order has no items' })
    }

    const getItem = db.prepare('SELECT * FROM menu_items WHERE id = ?')
    const resolved = []
    for (const it of items) {
      const menuItem = getItem.get(it.id)
      if (!menuItem) return res.status(400).json({ error: `Unknown menu item ${it.id}` })
      if (!menuItem.available) return res.status(409).json({ error: `${menuItem.name} is sold out` })
      const qty = Math.max(1, Math.min(20, parseInt(it.qty, 10) || 1))
      resolved.push({ menuItem, qty, note: String(it.note || '').slice(0, 200) })
    }

    const insert = db.transaction(() => {
      const info = db
        .prepare('INSERT INTO orders (umbrella_id, note, placed_by, created_at) VALUES (?, ?, ?, ?)')
        .run(umbrella.id, String(note).slice(0, 300), String(by).slice(0, 50), new Date().toISOString())
      const insertItem = db.prepare(
        'INSERT INTO order_items (order_id, menu_item_id, name, price, qty, note) VALUES (?, ?, ?, ?, ?, ?)'
      )
      for (const { menuItem, qty, note: itemNote } of resolved) {
        insertItem.run(info.lastInsertRowid, menuItem.id, menuItem.name, menuItem.price, qty, itemNote)
      }
      return info.lastInsertRowid
    })

    const orderId = insert()
    const order = withItems(getOrder.get(orderId))
    notify('orders', 'order_placed', { orderId, umbrella: umbrella.number })
    res.status(201).json(order)
  }

  r.post('/u/:token/orders', (req, res) => {
    const umbrella = getUmbrellaByToken.get(req.params.token)
    if (!umbrella) return res.status(404).json({ error: 'Unknown umbrella' })
    createOrder(umbrella, { ...req.body, by: '' }, res)
  })

  // Waiter takes an order at the umbrella (guest has no phone or prefers a person).
  r.post('/orders', requireRole('waiter'), (req, res) => {
    const umbrella = getUmbrellaById.get(req.body?.umbrellaId)
    if (!umbrella) return res.status(404).json({ error: 'Umbrella not found' })
    createOrder(umbrella, { ...req.body, by: req.staff.name }, res)
  })

  r.get('/u/:token/orders', (req, res) => {
    const umbrella = getUmbrellaByToken.get(req.params.token)
    if (!umbrella) return res.status(404).json({ error: 'Unknown umbrella' })
    const orders = db
      .prepare(
        `SELECT o.*, u.number AS umbrella_number FROM orders o
         JOIN umbrellas u ON u.id = o.umbrella_id
         WHERE o.umbrella_id = ? AND o.created_at >= ? ORDER BY o.created_at DESC`
      )
      .all(umbrella.id, todayStart())
      .map(withItems)
    const unsettledTotal = orders
      .filter((o) => !o.settled && o.status !== 'cancelled')
      .reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.price * i.qty, 0), 0)
    const openRequests = db
      .prepare(`SELECT * FROM service_requests WHERE umbrella_id = ? AND status IN ('open','claimed')`)
      .all(umbrella.id)
    res.json({ orders, unsettledTotal, openRequests })
  })

  r.post('/u/:token/requests', (req, res) => {
    const umbrella = getUmbrellaByToken.get(req.params.token)
    if (!umbrella) return res.status(404).json({ error: 'Unknown umbrella' })
    const type = req.body?.type
    if (!['waiter', 'bill'].includes(type)) return res.status(400).json({ error: 'Bad request type' })

    const existing = db
      .prepare(`SELECT * FROM service_requests WHERE umbrella_id = ? AND type = ? AND status IN ('open','claimed')`)
      .get(umbrella.id, type)
    if (existing) return res.json(existing)

    const info = db
      .prepare('INSERT INTO service_requests (umbrella_id, type, created_at) VALUES (?, ?, ?)')
      .run(umbrella.id, type, new Date().toISOString())
    const request = db.prepare('SELECT * FROM service_requests WHERE id = ?').get(info.lastInsertRowid)
    notify('requests', 'request_created', { type, umbrella: umbrella.number })
    res.status(201).json(request)
  })

  // ---------- Staff: orders ----------

  r.get('/orders', requireRole('waiter', 'bar'), (req, res) => {
    let rows
    if (req.query.active) {
      rows = db
        .prepare(
          `SELECT o.*, u.number AS umbrella_number, u.zone AS umbrella_zone FROM orders o
           JOIN umbrellas u ON u.id = o.umbrella_id
           WHERE o.status IN (${ACTIVE_STATUSES.map(() => '?').join(',')})
           ORDER BY o.created_at ASC`
        )
        .all(...ACTIVE_STATUSES)
    } else {
      rows = db
        .prepare(
          `SELECT o.*, u.number AS umbrella_number, u.zone AS umbrella_zone FROM orders o
           JOIN umbrellas u ON u.id = o.umbrella_id
           WHERE o.created_at >= ? ORDER BY o.created_at DESC`
        )
        .all(todayStart())
    }
    res.json(rows.map(withItems))
  })

  // Each role moves orders through its own steps only: the bar makes them,
  // waiters carry them. Managers can do everything.
  const ORDER_ACTIONS = { bar: ['accept', 'ready', 'cancel'], waiter: ['pickup', 'deliver'] }

  r.patch('/orders/:id', requireRole('waiter', 'bar'), (req, res) => {
    const { action } = req.body || {}
    const by = req.staff.name
    if (req.staff.role !== 'manager' && !ORDER_ACTIONS[req.staff.role]?.includes(action)) {
      return res.status(403).json({ error: `A ${req.staff.role} login can't ${action} orders` })
    }
    const order = getOrder.get(req.params.id)
    if (!order) return res.status(404).json({ error: 'Order not found' })

    const transitions = {
      accept: { from: ['placed'], to: 'accepted', stamp: 'accepted_at' },
      ready: { from: ['placed', 'accepted'], to: 'ready', stamp: 'ready_at' },
      pickup: { from: ['ready'], to: 'picked_up', stamp: 'picked_up_at' },
      deliver: { from: ['picked_up'], to: 'delivered', stamp: 'delivered_at' },
      cancel: { from: ['placed', 'accepted'], to: 'cancelled', stamp: null },
    }
    const t = transitions[action]
    if (!t) return res.status(400).json({ error: 'Unknown action' })
    if (!t.from.includes(order.status)) {
      const msg =
        action === 'pickup' && order.status === 'picked_up'
          ? `Already picked up by ${order.claimed_by || 'someone else'}`
          : `Order is ${order.status}, cannot ${action}`
      return res.status(409).json({ error: msg })
    }

    const now = new Date().toISOString()
    if (t.stamp) {
      db.prepare(`UPDATE orders SET status = ?, ${t.stamp} = ?, claimed_by = ? WHERE id = ?`).run(
        t.to,
        now,
        action === 'pickup' ? by : order.claimed_by,
        order.id
      )
    } else {
      db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(t.to, order.id)
    }

    const updated = withItems(getOrder.get(order.id))
    notify('orders', `order_${t.to}`, { orderId: updated.id, umbrella: updated.umbrella_number })
    res.json(updated)
  })

  // ---------- Staff: service requests ----------

  r.get('/requests', requireRole('waiter'), (req, res) => {
    const rows = db
      .prepare(
        `SELECT sr.*, u.number AS umbrella_number FROM service_requests sr
         JOIN umbrellas u ON u.id = sr.umbrella_id
         WHERE sr.status IN ('open','claimed') ORDER BY sr.created_at ASC`
      )
      .all()
    res.json(rows)
  })

  r.patch('/requests/:id', requireRole('waiter'), (req, res) => {
    const { action } = req.body || {}
    const by = req.staff.name
    const request = db.prepare('SELECT * FROM service_requests WHERE id = ?').get(req.params.id)
    if (!request) return res.status(404).json({ error: 'Request not found' })

    if (action === 'claim') {
      if (request.status !== 'open') return res.status(409).json({ error: `Already claimed by ${request.claimed_by}` })
      db.prepare(`UPDATE service_requests SET status = 'claimed', claimed_by = ? WHERE id = ?`).run(by, request.id)
    } else if (action === 'done') {
      db.prepare(`UPDATE service_requests SET status = 'done', closed_at = ? WHERE id = ?`).run(
        new Date().toISOString(),
        request.id
      )
    } else {
      return res.status(400).json({ error: 'Unknown action' })
    }
    notify('requests', `request_${action}`)
    res.json(db.prepare('SELECT * FROM service_requests WHERE id = ?').get(request.id))
  })

  // ---------- Menu management ----------

  r.get('/menu', (req, res) => {
    res.json(db.prepare('SELECT * FROM menu_items ORDER BY sort, id').all())
  })

  r.post('/menu', requireRole('manager'), (req, res) => {
    const { name, price, category, station = 'bar', name_el = '', description = '' } = req.body || {}
    if (!name || !category || !(price >= 0)) return res.status(400).json({ error: 'name, price, category required' })
    const maxSort = db.prepare('SELECT COALESCE(MAX(sort), 0) AS m FROM menu_items').get().m
    const info = db
      .prepare(
        'INSERT INTO menu_items (name, name_el, description, price, category, station, sort) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(name, name_el, description, price, category, station === 'kitchen' ? 'kitchen' : 'bar', maxSort + 1)
    notify('menu', 'menu_changed')
    res.status(201).json(db.prepare('SELECT * FROM menu_items WHERE id = ?').get(info.lastInsertRowid))
  })

  // Bar/kitchen may toggle stock; only managers pass anything else.
  r.patch('/menu/:id', requireRole('bar'), (req, res) => {
    const keys = Object.keys(req.body || {})
    if (req.staff.role !== 'manager' && keys.some((k) => k !== 'available')) {
      return res.status(403).json({ error: 'Only managers can edit menu details' })
    }
    return updateMenuItem(req, res)
  })

  function updateMenuItem(req, res) {
    const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id)
    if (!item) return res.status(404).json({ error: 'Item not found' })
    const allowed = ['name', 'name_el', 'description', 'price', 'category', 'station', 'available', 'sort']
    const updates = Object.entries(req.body || {}).filter(([k]) => allowed.includes(k))
    if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' })
    const setClause = updates.map(([k]) => `${k} = ?`).join(', ')
    db.prepare(`UPDATE menu_items SET ${setClause} WHERE id = ?`).run(...updates.map(([, v]) => v), item.id)
    notify('menu', 'menu_changed')
    res.json(db.prepare('SELECT * FROM menu_items WHERE id = ?').get(item.id))
  }

  r.delete('/menu/:id', requireRole('manager'), (req, res) => {
    db.prepare('DELETE FROM menu_items WHERE id = ?').run(req.params.id)
    notify('menu', 'menu_changed')
    res.json({ ok: true })
  })

  // ---------- Umbrellas & tabs ----------

  r.get('/umbrellas', requireRole('waiter'), (req, res) => {
    const rows = db.prepare('SELECT * FROM umbrellas ORDER BY zone, number').all()
    // The token is the umbrella's QR secret: whoever has it can order as
    // that umbrella, so only the manager (who prints the codes) gets it.
    res.json(req.staff.role === 'manager' ? rows : rows.map(withoutToken))
  })

  r.post('/umbrellas', requireRole('manager'), (req, res) => {
    const { number, zone = '' } = req.body || {}
    if (!number) return res.status(400).json({ error: 'number required' })
    try {
      const info = db
        .prepare('INSERT INTO umbrellas (number, zone, token) VALUES (?, ?, ?)')
        .run(number, zone, crypto.randomBytes(8).toString('hex'))
      notify('umbrellas', 'umbrella_added')
      res.status(201).json(db.prepare('SELECT * FROM umbrellas WHERE id = ?').get(info.lastInsertRowid))
    } catch {
      res.status(409).json({ error: 'Umbrella number already exists' })
    }
  })

  // Umbrellas that currently owe money — powers the waiter's tabs map.
  r.get('/tabs', requireRole('waiter'), (req, res) => {
    const rows = db
      .prepare(
        `SELECT o.umbrella_id, COALESCE(SUM(oi.price * oi.qty), 0) AS total
         FROM orders o JOIN order_items oi ON oi.order_id = o.id
         WHERE o.settled = 0 AND o.status != 'cancelled'
         GROUP BY o.umbrella_id`
      )
      .all()
    res.json(rows)
  })

  r.get('/umbrellas/:id/tab', requireRole('waiter'), (req, res) => {
    const umbrella = getUmbrellaById.get(req.params.id)
    if (!umbrella) return res.status(404).json({ error: 'Umbrella not found' })
    const sumOrders = (list) => list.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.price * i.qty, 0), 0)
    const orders = db
      .prepare(`SELECT * FROM orders WHERE umbrella_id = ? AND settled = 0 AND status != 'cancelled' ORDER BY created_at ASC`)
      .all(umbrella.id)
      .map(withItems)
    const paidOrders = db
      .prepare(
        `SELECT * FROM orders WHERE umbrella_id = ? AND settled = 1 AND status != 'cancelled' AND created_at >= ? ORDER BY created_at ASC`
      )
      .all(umbrella.id, todayStart())
      .map(withItems)
    res.json({ umbrella: withoutToken(umbrella), orders, total: sumOrders(orders), paidOrders, paidTotal: sumOrders(paidOrders) })
  })

  r.post('/umbrellas/:id/settle', requireRole('waiter'), (req, res) => {
    const umbrella = getUmbrellaById.get(req.params.id)
    if (!umbrella) return res.status(404).json({ error: 'Umbrella not found' })
    const settle = db.transaction(() => {
      db.prepare(`UPDATE orders SET settled = 1 WHERE umbrella_id = ? AND settled = 0`).run(umbrella.id)
      db.prepare(
        `UPDATE service_requests SET status = 'done', closed_at = ? WHERE umbrella_id = ? AND type = 'bill' AND status IN ('open','claimed')`
      ).run(new Date().toISOString(), umbrella.id)
    })
    settle()
    notify('orders', 'tab_settled', { umbrella: umbrella.number })
    notify('requests', 'tab_settled')
    res.json({ ok: true })
  })

  // ---------- Staff accounts & login ----------

  r.post('/login', (req, res) => {
    const ip = ipOf(req)
    const locked = loginFails.get(ip)
    if (locked && locked.until > Date.now()) {
      const retryAfter = Math.ceil((locked.until - Date.now()) / 1000)
      return res.status(429).json({ error: `Too many attempts — try again in ${retryAfter}s`, retryAfter })
    }

    const pin = String(req.body?.pin || '').trim()
    // PINs are stored as one-way hashes, so we verify against each row
    // rather than looking the PIN up directly. Fine at staff-list scale.
    const staff = db
      .prepare('SELECT id, name, role, pin, session_version FROM staff_users')
      .all()
      .find((s) => verifyPin(pin, s.pin))
    if (!staff) {
      const f = loginFails.get(ip) || { count: 0, until: 0 }
      f.count += 1
      if (f.count >= 5) {
        f.until = Date.now() + Math.min(15 * 60e3, 60e3 * 2 ** Math.floor((f.count - 5) / 5))
      }
      loginFails.set(ip, f)
      pruneFails()
      console.warn(`[auth] failed login from ${ip} (${f.count} in a row)`)
      return res.status(401).json({ error: 'Wrong PIN — ask the manager for yours' })
    }
    loginFails.delete(ip)

    // Managers get a short session; a weak manager PIN gets flagged so the
    // app can nag until it is changed (we only know the PIN at login time).
    const isManager = staff.role === 'manager'
    const ttl = isManager ? MANAGER_SESSION_MS : SESSION_MS
    const pinWarning = isManager && (pin.length < 6 || isWeakPin(pin))
    const extra = { v: staff.session_version, ...(pinWarning ? { w: 1 } : {}) }
    res.cookie(COOKIE, createSession(staff, SECRET, ttl, extra), {
      httpOnly: true,
      // strict: the browser never sends the login along with a request
      // that another website starts.
      sameSite: 'strict',
      maxAge: ttl,
      path: '/',
      // In production the cookie only travels over HTTPS; in dev (plain
      // http://localhost) it must stay off or the browser drops the cookie.
      secure: process.env.NODE_ENV === 'production',
    })
    res.json({ id: staff.id, name: staff.name, role: staff.role, pinWarning })
  })

  r.post('/logout', (req, res) => {
    res.clearCookie(COOKIE, { path: '/' })
    res.json({ ok: true })
  })

  // Who does the server think I am? Screens use this instead of trusting
  // whatever the browser has stored locally.
  r.get('/me', (req, res) => {
    const session = sessionOf(req)
    if (!session) return res.status(401).json({ error: 'Not logged in' })
    res.json({ id: session.id, name: session.name, role: session.role, pinWarning: !!session.w })
  })

  r.get('/staff', requireRole('manager'), (req, res) => {
    // PIN hashes never leave the server.
    res.json(db.prepare('SELECT id, name, role FROM staff_users ORDER BY role, name').all())
  })

  r.post('/staff', requireRole('manager'), (req, res) => {
    const { name, role, pin } = req.body || {}
    if (!name || !['manager', 'waiter', 'bar'].includes(role)) {
      return res.status(400).json({ error: 'Name and a valid role are required' })
    }
    if (!/^\d{4,6}$/.test(String(pin || ''))) {
      return res.status(400).json({ error: 'PIN must be 4–6 digits' })
    }
    if (isWeakPin(pin)) {
      return res.status(400).json({ error: 'That PIN is too easy to guess (repeated digits or 1234-style runs) — pick another' })
    }
    // Managers hold the keys to everything — their PIN must be 6 digits.
    if (role === 'manager' && String(pin).length !== 6) {
      return res.status(400).json({ error: 'Manager PINs must be 6 digits' })
    }
    // Salted hashes never collide, so uniqueness is checked by verifying
    // the new PIN against every existing hash instead of a DB constraint.
    const taken = db
      .prepare('SELECT pin FROM staff_users')
      .all()
      .some((s) => verifyPin(String(pin), s.pin))
    if (taken) return res.status(409).json({ error: 'That PIN is already taken — pick another' })
    const info = db.prepare('INSERT INTO staff_users (name, role, pin) VALUES (?, ?, ?)').run(name, role, hashPin(pin))
    res.status(201).json(db.prepare('SELECT id, name, role FROM staff_users WHERE id = ?').get(info.lastInsertRowid))
  })

  r.delete('/staff/:id', requireRole('manager'), (req, res) => {
    const target = db.prepare('SELECT * FROM staff_users WHERE id = ?').get(req.params.id)
    if (!target) return res.status(404).json({ error: 'Not found' })
    if (target.role === 'manager') {
      const managers = db.prepare(`SELECT COUNT(*) AS n FROM staff_users WHERE role = 'manager'`).get().n
      if (managers <= 1) return res.status(409).json({ error: 'You cannot remove the last manager' })
    }
    db.prepare('DELETE FROM staff_users WHERE id = ?').run(target.id)
    res.json({ ok: true })
  })

  // Log someone out on every phone and tablet (a lost phone, a shared PIN).
  r.post('/staff/:id/logout-everywhere', requireRole('manager'), (req, res) => {
    const info = db.prepare('UPDATE staff_users SET session_version = session_version + 1 WHERE id = ?').run(req.params.id)
    if (!info.changes) return res.status(404).json({ error: 'Not found' })
    res.json({ ok: true })
  })

  // ---------- Manager stats ----------

  r.get('/stats/analytics', requireRole('manager'), (req, res) => {
    const range = req.query.range || '30d'
    const now = new Date()
    let from = new Date(0)
    if (range === 'today') {
      from = new Date()
      from.setHours(0, 0, 0, 0)
    } else if (range === '7d') from = new Date(now.getTime() - 7 * 86400e3)
    else if (range === '30d') from = new Date(now.getTime() - 30 * 86400e3)
    else if (range === 'year') from = new Date(now.getFullYear(), 0, 1)
    const fromIso = from.toISOString()

    const summary = db
      .prepare(
        `SELECT COUNT(DISTINCT o.id) AS orders,
                COALESCE(SUM(oi.price * oi.qty), 0) AS revenue,
                COALESCE(SUM(oi.qty), 0) AS itemsSold
         FROM orders o JOIN order_items oi ON oi.order_id = o.id
         WHERE o.status != 'cancelled' AND o.created_at >= ?`
      )
      .get(fromIso)
    summary.avgOrder = summary.orders ? summary.revenue / summary.orders : 0

    // Always the last 12 months, independent of the range picker.
    const twelveAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1)
    const monthRows = db
      .prepare(
        `SELECT substr(o.created_at, 1, 7) AS month,
                COALESCE(SUM(oi.price * oi.qty), 0) AS revenue,
                COUNT(DISTINCT o.id) AS orders
         FROM orders o JOIN order_items oi ON oi.order_id = o.id
         WHERE o.status != 'cancelled' AND o.created_at >= ?
         GROUP BY month`
      )
      .all(twelveAgo.toISOString())
    const byMonth = []
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const row = monthRows.find((m) => m.month === key)
      byMonth.push({ month: key, revenue: row?.revenue || 0, orders: row?.orders || 0 })
    }

    const byHour = db
      .prepare(
        `SELECT CAST(strftime('%H', o.created_at, 'localtime') AS INTEGER) AS hour, COUNT(*) AS orders
         FROM orders o WHERE o.status != 'cancelled' AND o.created_at >= ?
         GROUP BY hour ORDER BY hour`
      )
      .all(fromIso)

    const topItems = db
      .prepare(
        `SELECT oi.name, SUM(oi.qty) AS qty, SUM(oi.price * oi.qty) AS revenue
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE o.status != 'cancelled' AND o.created_at >= ?
         GROUP BY oi.name ORDER BY qty DESC LIMIT 10`
      )
      .all(fromIso)

    const byCategory = db
      .prepare(
        `SELECT COALESCE(m.category, 'Removed items') AS category,
                SUM(oi.price * oi.qty) AS revenue, SUM(oi.qty) AS qty
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         LEFT JOIN menu_items m ON m.id = oi.menu_item_id
         WHERE o.status != 'cancelled' AND o.created_at >= ?
         GROUP BY category ORDER BY revenue DESC`
      )
      .all(fromIso)

    const byZone = db
      .prepare(
        `SELECT u.zone, SUM(oi.price * oi.qty) AS revenue, COUNT(DISTINCT o.id) AS orders
         FROM orders o
         JOIN umbrellas u ON u.id = o.umbrella_id
         JOIN order_items oi ON oi.order_id = o.id
         WHERE o.status != 'cancelled' AND o.created_at >= ?
         GROUP BY u.zone ORDER BY revenue DESC`
      )
      .all(fromIso)

    const timings = db
      .prepare(
        `SELECT AVG((julianday(ready_at) - julianday(created_at)) * 1440) AS avgPrepMin,
                AVG((julianday(delivered_at) - julianday(ready_at)) * 1440) AS avgDeliverMin
         FROM orders
         WHERE status = 'delivered' AND ready_at IS NOT NULL AND created_at >= ?`
      )
      .get(fromIso)

    const delivered = db
      .prepare(
        `SELECT claimed_by AS name, COUNT(*) AS delivered FROM orders
         WHERE status = 'delivered' AND claimed_by != '' AND created_at >= ? GROUP BY claimed_by`
      )
      .all(fromIso)
    const taken = db
      .prepare(
        `SELECT placed_by AS name, COUNT(*) AS taken FROM orders
         WHERE status != 'cancelled' AND placed_by != '' AND created_at >= ? GROUP BY placed_by`
      )
      .all(fromIso)
    const staffMap = new Map()
    for (const d of delivered) staffMap.set(d.name, { name: d.name, delivered: d.delivered, taken: 0 })
    for (const t of taken) {
      const s = staffMap.get(t.name) || { name: t.name, delivered: 0, taken: 0 }
      s.taken = t.taken
      staffMap.set(t.name, s)
    }
    const staff = [...staffMap.values()].sort((a, b) => b.delivered + b.taken - (a.delivered + a.taken))

    const sourceSplit = db
      .prepare(
        `SELECT SUM(CASE WHEN placed_by = '' THEN 1 ELSE 0 END) AS guest,
                SUM(CASE WHEN placed_by != '' THEN 1 ELSE 0 END) AS waiter
         FROM orders WHERE status != 'cancelled' AND created_at >= ?`
      )
      .get(fromIso)

    res.json({ range, summary, byMonth, byHour, topItems, byCategory, byZone, timings, staff, sourceSplit })
  })

  r.get('/stats/today', requireRole('manager'), (req, res) => {
    const start = todayStart()
    const orderCount = db
      .prepare(`SELECT COUNT(*) AS n FROM orders WHERE created_at >= ? AND status != 'cancelled'`)
      .get(start).n
    const revenue =
      db
        .prepare(
          `SELECT COALESCE(SUM(oi.price * oi.qty), 0) AS total FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           WHERE o.created_at >= ? AND o.status != 'cancelled'`
        )
        .get(start).total || 0
    const topItems = db
      .prepare(
        `SELECT oi.name, SUM(oi.qty) AS qty FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE o.created_at >= ? AND o.status != 'cancelled'
         GROUP BY oi.name ORDER BY qty DESC LIMIT 5`
      )
      .all(start)
    res.json({ orderCount, revenue, topItems })
  })

  // ---------- Bookings (umbrella reservations) ----------
  // Waiters and bar see who's coming; staff can add, cancel and check in.

  const bookingFail = (res, e) => {
    if (e instanceof Bookings.BookingError) {
      return res.status(e.code === 'not_found' ? 404 : 409).json({ error: e.message, code: e.code })
    }
    throw e
  }

  r.get('/bookings', requireRole('waiter', 'bar'), (req, res) => {
    const date = Bookings.isValidDate(req.query.date) ? req.query.date : Bookings.athensDate()
    res.json({ date, today: Bookings.athensDate(), bookings: Bookings.listBookings(date), availability: Bookings.availability(date) })
  })

  // Umbrella ids held today — the waiter's beach map marks them.
  r.get('/bookings/reserved', requireRole('waiter', 'bar'), (req, res) => {
    const date = Bookings.isValidDate(req.query.date) ? req.query.date : Bookings.athensDate()
    res.json({ date, umbrellaIds: Bookings.reservedIds(date) })
  })

  r.post('/bookings', requireRole('waiter'), (req, res) => {
    const b = req.body || {}
    try {
      const booking = Bookings.createBooking({
        date: b.date,
        name: b.name,
        phone: b.phone,
        partySize: b.partySize,
        count: b.umbrellas || umbrellasFor(parseInt(b.partySize, 10) || 1, getVoiceSettings()),
        preference: b.preference,
        umbrellaNumbers: Array.isArray(b.umbrellaNumbers) ? b.umbrellaNumbers : null,
        arrivalTime: b.arrivalTime,
        notes: b.notes,
        source: 'staff',
        createdBy: req.staff.name,
      })
      notify('bookings', 'booking_created', { date: booking.date })
      res.status(201).json(booking)
    } catch (e) {
      bookingFail(res, e)
    }
  })

  r.patch('/bookings/:id', requireRole('waiter'), (req, res) => {
    const { action } = req.body || {}
    try {
      let booking
      if (action === 'cancel') booking = Bookings.cancelBooking(Number(req.params.id))
      else if (action === 'arrived') booking = Bookings.setArrived(Number(req.params.id), true)
      else if (action === 'not_arrived') booking = Bookings.setArrived(Number(req.params.id), false)
      else return res.status(400).json({ error: 'Unknown action' })
      notify('bookings', `booking_${action}`, { date: booking.date })
      res.json(booking)
    } catch (e) {
      bookingFail(res, e)
    }
  })

  // ---------- Phone agent (manager) ----------

  r.get('/voice/settings', requireRole('manager'), (req, res) => {
    res.json({ settings: getVoiceSettings(), status: voiceStatus(req) })
  })

  r.put('/voice/settings', requireRole('manager'), (req, res) => {
    res.json({ settings: updateVoiceSettings(req.body || {}), status: voiceStatus(req) })
  })

  // ElevenLabs speech for the browser test phone (manager only, so the
  // account's credits can't be spent by anyone else).
  r.post('/voice/tts', requireRole('manager'), async (req, res) => {
    if (!hasElevenKey()) return res.status(503).json({ error: 'ElevenLabs key missing' })
    const text = String(req.body?.text || '').trim().slice(0, 600)
    if (!text) return res.status(400).json({ error: 'No text' })
    try {
      await speakTo(res, { text, lang: req.body?.lang === 'en' ? 'en' : 'el', settings: getVoiceSettings() })
    } catch (e) {
      console.warn('[voice] ElevenLabs:', e.message)
      if (!res.headersSent) res.status(502).json({ error: e.message })
    }
  })

  r.get('/voice/eleven-voices', requireRole('manager'), async (req, res) => {
    if (!hasElevenKey()) return res.status(503).json({ error: 'ElevenLabs key missing' })
    try {
      res.json(await listVoices())
    } catch (e) {
      res.status(502).json({ error: e.message })
    }
  })

  r.get('/voice/calls', requireRole('manager'), (req, res) => {
    const calls = db
      .prepare('SELECT * FROM voice_calls ORDER BY id DESC LIMIT 50')
      .all()
      .map((c) => ({ ...c, transcript: JSON.parse(c.transcript || '[]') }))
    res.json(calls)
  })

  r.get('/voice/messages', requireRole('waiter', 'bar'), (req, res) => {
    res.json(db.prepare('SELECT * FROM voice_messages ORDER BY handled, id DESC LIMIT 100').all())
  })

  r.patch('/voice/messages/:id', requireRole('waiter', 'bar'), (req, res) => {
    db.prepare('UPDATE voice_messages SET handled = ? WHERE id = ?').run(req.body?.handled ? 1 : 0, req.params.id)
    notify('voice', 'message_updated')
    res.json({ ok: true })
  })

  return r
}

module.exports.sessionOf = sessionOf
