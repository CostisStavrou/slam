const Database = require('better-sqlite3')
const path = require('path')
const crypto = require('crypto')
const { hashPin } = require('./auth')

const db = new Database(process.env.SLAM_DB || path.join(__dirname, '..', 'beachbar.sqlite'))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
CREATE TABLE IF NOT EXISTS umbrellas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  zone TEXT NOT NULL DEFAULT '',
  token TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS menu_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_el TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  price REAL NOT NULL,
  category TEXT NOT NULL,
  station TEXT NOT NULL DEFAULT 'bar',
  available INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  umbrella_id INTEGER NOT NULL REFERENCES umbrellas(id),
  status TEXT NOT NULL DEFAULT 'placed',
  note TEXT NOT NULL DEFAULT '',
  claimed_by TEXT NOT NULL DEFAULT '',
  settled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  accepted_at TEXT,
  ready_at TEXT,
  picked_up_at TEXT,
  delivered_at TEXT
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  menu_item_id INTEGER,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS service_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  umbrella_id INTEGER NOT NULL REFERENCES umbrellas(id),
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  claimed_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  closed_at TEXT
);

CREATE TABLE IF NOT EXISTS staff_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  pin TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Umbrella reservations for a day. A booking can hold several umbrellas
-- (a big group); each held umbrella is one row in booking_spots, and the
-- unique index there is what makes double-booking impossible.
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  date TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  party_size INTEGER NOT NULL DEFAULT 1,
  arrival_time TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'confirmed',
  source TEXT NOT NULL DEFAULT 'staff',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  cancelled_at TEXT
);
CREATE INDEX IF NOT EXISTS bookings_date ON bookings(date);
CREATE INDEX IF NOT EXISTS bookings_phone ON bookings(phone);

CREATE TABLE IF NOT EXISTS booking_spots (
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  umbrella_id INTEGER NOT NULL REFERENCES umbrellas(id),
  date TEXT NOT NULL,
  PRIMARY KEY (booking_id, umbrella_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS booking_spots_one_per_day ON booking_spots(date, umbrella_id);

-- Phone calls handled by the voice agent, with the transcript for staff.
CREATE TABLE IF NOT EXISTS voice_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  call_sid TEXT NOT NULL DEFAULT '',
  from_number TEXT NOT NULL DEFAULT '',
  is_test INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  outcome TEXT NOT NULL DEFAULT '',
  transcript TEXT NOT NULL DEFAULT '[]'
);

-- "Please call me back" notes the agent takes when it can't help directly.
CREATE TABLE IF NOT EXISTS voice_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  call_id INTEGER REFERENCES voice_calls(id),
  name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  handled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
`)

// Additive migrations for databases created before these columns existed.
try {
  db.exec(`ALTER TABLE orders ADD COLUMN placed_by TEXT NOT NULL DEFAULT ''`)
} catch {
  // column already exists
}
// Bumping a person's session_version logs them out on every device.
try {
  db.exec(`ALTER TABLE staff_users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0`)
} catch {
  // column already exists
}

// Migrate any plain-text PINs from before hashing was introduced.
const plainPins = db.prepare(`SELECT id, pin FROM staff_users WHERE pin NOT LIKE 'scrypt$%'`).all()
if (plainPins.length > 0) {
  const update = db.prepare('UPDATE staff_users SET pin = ? WHERE id = ?')
  const migrate = db.transaction(() => {
    for (const s of plainPins) update.run(hashPin(s.pin), s.id)
  })
  migrate()
}

// ---- Seed data (only on first run) ----

const staffCount = db.prepare('SELECT COUNT(*) AS n FROM staff_users').get().n
if (staffCount === 0) {
  const insert = db.prepare('INSERT INTO staff_users (name, role, pin) VALUES (?, ?, ?)')
  insert.run('Manager', 'manager', hashPin('1234'))
  insert.run('Maria', 'waiter', hashPin('1111'))
  insert.run('Nikos', 'bar', hashPin('2222'))
}

const umbrellaCount = db.prepare('SELECT COUNT(*) AS n FROM umbrellas').get().n
if (umbrellaCount === 0) {
  // Beach layout: 3 rows (A by the sea, then B, C), 12 umbrellas per row —
  // a 5-wide block on the left, a walkway, and a 7-wide block on the right.
  const ZONES = { A: 'Front row — by the sea', B: 'Middle row', C: 'Back row' }
  const insert = db.prepare('INSERT INTO umbrellas (number, zone, token) VALUES (?, ?, ?)')
  const seedUmbrellas = db.transaction(() => {
    for (const row of ['A', 'B', 'C']) {
      for (let i = 1; i <= 12; i++) {
        insert.run(`${row}${i}`, ZONES[row], crypto.randomBytes(8).toString('hex'))
      }
    }
  })
  seedUmbrellas()
}

const menuCount = db.prepare('SELECT COUNT(*) AS n FROM menu_items').get().n
if (menuCount === 0) {
  const items = [
    // [name, name_el, description, price, category, station]
    ['Mojito', 'Μοχίτο', 'White rum, lime, mint, soda', 9.0, 'Cocktails', 'bar'],
    ['Aperol Spritz', 'Άπερολ Σπριτζ', 'Aperol, prosecco, soda', 8.5, 'Cocktails', 'bar'],
    ['Margarita', 'Μαργαρίτα', 'Tequila, triple sec, lime', 9.0, 'Cocktails', 'bar'],
    ['Piña Colada', 'Πίνα Κολάντα', 'Rum, coconut, pineapple', 9.5, 'Cocktails', 'bar'],
    ['Espresso Martini', 'Εσπρέσο Μαρτίνι', 'Vodka, espresso, coffee liqueur', 10.0, 'Cocktails', 'bar'],
    ['Mythos Beer 500ml', 'Μύθος 500ml', '', 4.5, 'Beer & Wine', 'bar'],
    ['Fix Hellas 500ml', 'Φιξ 500ml', '', 4.5, 'Beer & Wine', 'bar'],
    ['Corona', 'Κορόνα', '', 6.0, 'Beer & Wine', 'bar'],
    ['White Wine (glass)', 'Λευκό Κρασί (ποτήρι)', 'Assyrtiko', 6.0, 'Beer & Wine', 'bar'],
    ['Rosé Wine (glass)', 'Ροζέ Κρασί (ποτήρι)', '', 6.0, 'Beer & Wine', 'bar'],
    ['Freddo Espresso', 'Φρέντο Εσπρέσο', '', 3.5, 'Coffee', 'bar'],
    ['Freddo Cappuccino', 'Φρέντο Καπουτσίνο', '', 4.0, 'Coffee', 'bar'],
    ['Espresso', 'Εσπρέσο', '', 2.5, 'Coffee', 'bar'],
    ['Iced Chocolate', 'Κρύα Σοκολάτα', '', 4.5, 'Coffee', 'bar'],
    ['Still Water 500ml', 'Νερό 500ml', '', 1.0, 'Soft Drinks', 'bar'],
    ['Coca-Cola', 'Κόκα Κόλα', '', 3.0, 'Soft Drinks', 'bar'],
    ['Sparkling Water', 'Ανθρακούχο Νερό', '', 2.5, 'Soft Drinks', 'bar'],
    ['Fresh Orange Juice', 'Φρέσκος Χυμός Πορτοκάλι', '', 5.0, 'Soft Drinks', 'bar'],
    ['Club Sandwich', 'Κλαμπ Σάντουιτς', 'Chicken, bacon, fries', 9.0, 'Food', 'kitchen'],
    ['Greek Salad', 'Χωριάτικη Σαλάτα', 'Tomato, cucumber, feta, olives', 8.0, 'Food', 'kitchen'],
    ['Chicken Wrap', 'Τορτίγια Κοτόπουλο', 'Grilled chicken, tzatziki', 8.5, 'Food', 'kitchen'],
    ['Margherita Pizza', 'Πίτσα Μαργαρίτα', '', 10.0, 'Food', 'kitchen'],
    ['Beach Burger', 'Μπέργκερ', 'Beef, cheddar, fries', 11.0, 'Food', 'kitchen'],
    ['French Fries', 'Πατάτες Τηγανητές', '', 4.5, 'Snacks & Sweets', 'kitchen'],
    ['Nachos', 'Νάτσος', 'Cheese, salsa, guacamole', 7.0, 'Snacks & Sweets', 'kitchen'],
    ['Fruit Salad', 'Φρουτοσαλάτα', 'Seasonal fruits', 6.0, 'Snacks & Sweets', 'kitchen'],
    ['Ice Cream (2 scoops)', 'Παγωτό (2 μπάλες)', '', 5.0, 'Snacks & Sweets', 'kitchen'],
  ]
  const insert = db.prepare(
    'INSERT INTO menu_items (name, name_el, description, price, category, station, sort) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  const seedMenu = db.transaction(() => {
    items.forEach((it, i) => insert.run(...it, i))
  })
  seedMenu()
}

module.exports = db
