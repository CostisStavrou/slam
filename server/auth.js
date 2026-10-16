const crypto = require('crypto')

// PIN hashing with Node's built-in scrypt — no native dependencies.
// Stored format: "scrypt$<salt hex>$<hash hex>". One-way: the real PIN
// never touches the database, only this derived value does.

const KEYLEN = 32

function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(String(pin), salt, KEYLEN).toString('hex')
  return `scrypt$${salt}$${hash}`
}

function verifyPin(pin, stored) {
  if (typeof stored !== 'string' || !stored.startsWith('scrypt$')) return false
  const [, salt, hash] = stored.split('$')
  if (!salt || !hash) return false
  const candidate = crypto.scryptSync(String(pin), salt, KEYLEN)
  const expected = Buffer.from(hash, 'hex')
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected)
}

// ---- Sessions ----
// A session token is "<base64 payload>.<HMAC signature>". The payload carries
// who you are and when it expires; the signature (made with a server-only
// secret) makes it impossible to forge or to promote yourself to manager.

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url')
}

function createSession(staff, secret, maxAgeMs = 30 * 86400e3, extra = {}) {
  const payload = Buffer.from(
    JSON.stringify({ ...extra, id: staff.id, name: staff.name, role: staff.role, exp: Date.now() + maxAgeMs })
  ).toString('base64url')
  return `${payload}.${sign(payload, secret)}`
}

function readSession(token, secret) {
  if (typeof token !== 'string') return null
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null
  const expected = Buffer.from(sign(payload, secret))
  const given = Buffer.from(sig)
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString())
    if (!data.exp || Date.now() > data.exp) return null
    return data
  } catch {
    return null
  }
}

module.exports = { hashPin, verifyPin, createSession, readSession }
