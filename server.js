const path = require('path')

// Secrets (Claude API key, Twilio auth token) live in slam.env one level ABOVE
// the app folder, so deploys — which mirror the folder — never overwrite them.
try {
  process.loadEnvFile(path.join(__dirname, '..', 'slam.env'))
} catch {
  // no env file (local dev) — voice line stays off
}

const { createServer } = require('http')
const next = require('next')
const express = require('express')
const { Server } = require('socket.io')

const dev = process.env.NODE_ENV !== 'production'
const port = parseInt(process.env.PORT || '3000', 10)

const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const server = express()
  // Only behind a reverse proxy (Caddy/nginx) may X-Forwarded-For be
  // believed. Without one, any client could send that header and pose as a
  // new address on every guess, slipping past the wrong-PIN lockout.
  if (process.env.TRUST_PROXY) server.set('trust proxy', 1)
  const httpServer = createServer(server)
  const io = new Server(httpServer)

  const createApi = require('./server/api')
  const { createVoiceRouter, attachVoiceRelay } = require('./server/voice/twilio')
  // Twilio webhooks post form data, so they get their own parser.
  server.use('/api/voice', createVoiceRouter())
  server.use('/api', express.json(), createApi(io))
  attachVoiceRelay(httpServer, {
    notify: (type, event, payload = {}) => io.emit('changed', { type, event, ...payload }),
    sessionOf: createApi.sessionOf,
  })
  server.all('*', (req, res) => handle(req, res))

  httpServer.listen(port, () => {
    console.log(`> Slam Beach Bar running on http://localhost:${port}`)
  })
})
