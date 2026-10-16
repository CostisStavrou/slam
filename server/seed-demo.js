// Fills the database with a realistic demo season (Apr–Oct, peak in July)
// so the manager analytics have something to show. Run once:
//   node server/seed-demo.js
// Reset everything by deleting beachbar.sqlite and restarting the server.
const db = require('./db')

const existing = db.prepare('SELECT COUNT(*) AS n FROM orders').get().n
if (existing > 100) {
  console.log(`Orders table already has ${existing} rows — not seeding again.`)
  process.exit(0)
}

const menu = db.prepare('SELECT * FROM menu_items').all()
const umbrellas = db.prepare('SELECT * FROM umbrellas').all()
const STAFF = ['Maria', 'Nikos', 'Eleni', 'Kostas']

// Popularity weights: drinks and coffee move a lot more than food.
const weightFor = (m) =>
  ({ Coffee: 5, 'Soft Drinks': 4, 'Beer & Wine': 4, Cocktails: 3, Food: 2, 'Snacks & Sweets': 2 }[m.category] || 1)
const weighted = menu.flatMap((m) => Array(weightFor(m)).fill(m))

// Orders per day by month (0-based): beach season Apr–Oct, July peak.
const SEASON = { 3: 8, 4: 18, 5: 38, 6: 60, 7: 52, 8: 34, 9: 12 }
// Hour-of-day weights, 9:00–19:00, lunch/afternoon peak.
const HOURS = [9, 10, 10, 11, 11, 12, 12, 12, 13, 13, 13, 14, 14, 14, 15, 15, 15, 16, 16, 17, 17, 18, 19]

const rand = (n) => Math.floor(Math.random() * n)
const pick = (arr) => arr[rand(arr.length)]

const insertOrder = db.prepare(`
  INSERT INTO orders (umbrella_id, status, note, claimed_by, placed_by, settled,
                      created_at, accepted_at, ready_at, picked_up_at, delivered_at)
  VALUES (?, 'delivered', '', ?, ?, 1, ?, ?, ?, ?, ?)
`)
const insertItem = db.prepare(
  'INSERT INTO order_items (order_id, menu_item_id, name, price, qty, note) VALUES (?, ?, ?, ?, ?, ?)'
)

let orders = 0
const seed = db.transaction(() => {
  const today = new Date()
  for (let back = 365; back >= 1; back--) {
    const day = new Date(today.getTime() - back * 86400e3)
    const perDay = SEASON[day.getMonth()]
    if (!perDay) continue
    const weekend = day.getDay() === 0 || day.getDay() === 6
    const n = Math.round(perDay * (0.7 + Math.random() * 0.6) * (weekend ? 1.35 : 1))
    for (let i = 0; i < n; i++) {
      const created = new Date(day)
      created.setHours(pick(HOURS), rand(60), rand(60), 0)
      const accepted = new Date(created.getTime() + (1 + rand(3)) * 60e3)
      const ready = new Date(accepted.getTime() + (3 + rand(10)) * 60e3)
      const picked = new Date(ready.getTime() + (1 + rand(3)) * 60e3)
      const delivered = new Date(picked.getTime() + (1 + rand(3)) * 60e3)
      const waiter = pick(STAFF)
      const placedBy = Math.random() < 0.25 ? pick(STAFF) : '' // ~25% taken in person
      const info = insertOrder.run(
        pick(umbrellas).id,
        waiter,
        placedBy,
        created.toISOString(),
        accepted.toISOString(),
        ready.toISOString(),
        picked.toISOString(),
        delivered.toISOString()
      )
      const lines = 1 + rand(3)
      for (let l = 0; l < lines; l++) {
        const item = pick(weighted)
        insertItem.run(info.lastInsertRowid, item.id, item.name, item.price, 1 + rand(2), '')
      }
      orders++
    }
  }
})
seed()
console.log(`Seeded ${orders} demo orders across the season.`)
