# Slam

The operating system of Slam Bar, a beach bar in Pelion, Greece. Guests order from their sunbed, staff run the floor from tablets, and a voice agent answers the phone. It runs in production at [slambar.gr](https://slambar.gr).

## What it does

- **Ordering from the sunbed.** Every umbrella has its own QR code. A guest scans it, sees the menu in Greek or English, and orders or calls a waiter from their phone. No app or account needed.
- **Live floor for the staff.** Separate screens for the bar, the waiters and the manager. Orders, requests and tabs appear instantly on every tablet over WebSockets, with a map of the beach showing which umbrellas need attention.
- **Tabs and settling up.** Each umbrella keeps a running tab that a waiter settles at the end.
- **Manager analytics.** Revenue and order trends across the season, plus menu, staff and PIN management.
- **Bookings.** Sunbed and table bookings, including ones taken over the phone.
- **Phone voice agent.** Callers speak to an AI agent in Greek or English. It answers questions about opening hours, the menu, prices and directions, takes bookings with the guest's name, party size and number, and hands the call to the staff when it can't help.
- **Staff logins.** Each person signs in with a PIN. PINs are hashed, sessions are signed, and each role (bar, waiter, manager) sees only what it needs. Manager sessions are short-lived, obvious PINs like 1234 are refused, and repeated wrong PINs lock the screen for a while.

## How it's built

| Part | Technology |
|---|---|
| Front end | React 19 and Next.js 15, Tailwind CSS |
| Server | Node.js with Express, Socket.io for live updates |
| Database | SQLite (better-sqlite3), with nightly backups |
| Voice agent | Twilio ConversationRelay for the call, Claude (Anthropic API) for the conversation, ElevenLabs for the voice |
| Hosting | A small Ubuntu server, Caddy for automatic HTTPS, systemd for start-up and restarts |

## Running it locally

```bash
npm install
npm run dev
```

The app starts on <http://localhost:3000>. `node server/seed-demo.js` fills the database with a demo season, so the manager's analytics have data to show. The voice agent needs API keys for Anthropic, Twilio and ElevenLabs, read from environment variables (see `deploy/VOICE-SETUP.md`); everything else works without them.

## Deployment

`deploy/` holds the server setup script, the systemd services, the backup timer and the Caddy configuration. `deploy/README.md` is the step-by-step runbook.
