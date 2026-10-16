// Nightly database backup. Run: node server/backup.js
// Writes a dated copy of the SQLite database and keeps the newest 30.
const path = require('path')
const fs = require('fs')
const db = require('./db')

const dir = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups')
fs.mkdirSync(dir, { recursive: true })

const stamp = new Date().toISOString().slice(0, 10)
const dest = path.join(dir, `beachbar-${stamp}.sqlite`)

db.backup(dest)
  .then(() => {
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith('beachbar-') && f.endsWith('.sqlite'))
      .sort()
    for (const f of files.slice(0, Math.max(0, files.length - 30))) {
      fs.unlinkSync(path.join(dir, f))
    }
    console.log(`backup ok: ${dest}`)
    process.exit(0)
  })
  .catch((e) => {
    console.error('backup failed:', e.message)
    process.exit(1)
  })
