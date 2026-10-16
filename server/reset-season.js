// Wipes all orders and service requests (menu, umbrellas and staff stay).
// For opening day, after demo/testing data. Refuses to run without --yes.
//   node server/reset-season.js --yes
const db = require('./db')

if (!process.argv.includes('--yes')) {
  const orders = db.prepare('SELECT COUNT(*) AS n FROM orders').get().n
  console.log(`This would permanently delete ${orders} orders and all service requests.`)
  console.log('Menu, umbrellas and staff are kept. Run with --yes to confirm.')
  process.exit(1)
}

const wipe = db.transaction(() => {
  db.prepare('DELETE FROM order_items').run()
  db.prepare('DELETE FROM orders').run()
  db.prepare('DELETE FROM service_requests').run()
})
wipe()
db.exec('VACUUM')
console.log('Season reset: orders and requests wiped. Menu, umbrellas and staff kept.')
