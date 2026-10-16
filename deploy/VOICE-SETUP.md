# Phone agent — setup guide

The phone agent answers calls to the bar in Greek (press 2 for English), takes
umbrella bookings, answers questions from the facts you give it, takes
call-back messages and puts callers through to the bar when they ask for a person.

How a call flows:

```
Guest's phone → Twilio number → slambar.gr/api/voice/incoming
                                      ↓
          Twilio turns speech ⇄ text (Greek / English)
                                      ↓
          Claude (the "brain") + the booking system on your server
                                      ↓
          Bookings appear live on the waiter and manager screens
```

## Running it locally (no hosting, no phone number)

Real phone calls need the app on a public server. On the Mac alone, you talk to
the same agent through the **browser test phone** — it runs exactly the same
code a phone call would.

1. Get a Claude API key (step 1 below).
2. Create the file `~/dev/slam.env` (next to the `Slam` folder, not inside it):

   ```
   ANTHROPIC_API_KEY=sk-ant-...your key...
   ```

3. Restart the app, log in as manager → **Τηλεφωνητής → Δοκιμή στον browser → 📞 Κλήση**.
   The "Twilio missing" line in the checklist is expected locally.

Everything below is only needed if the app is ever hosted publicly again.

---

For real phone calls you need three things: a Claude API key, a Twilio account
with a phone number, and two lines in a file on the server. About an hour in
total, plus however long Twilio takes to approve a Greek number.

---

## 1. Claude API key (≈10 min)

1. Go to **console.anthropic.com**, sign up and add a payment method / credit.
2. **API keys → Create key**, name it `slam-phone`. Copy it (starts with `sk-ant-`).
   You only see it once.

## 2. Twilio number (≈30 min + approval time)

1. Sign up at **twilio.com** and upgrade from the trial (trial numbers play a
   "trial account" message to callers).
2. **Phone Numbers → Buy a number → Greece**.
   - A **local** number (e.g. a Volos/Pelion 242x number) needs proof of a
     business address in that area — the bar's business registry extract
     (ΓΕΜΗ) or a utility bill for the Afissos address. Twilio calls this a
     *Regulatory Bundle*; approval can take a few days.
   - **Easier alternative:** keep the bar's existing number and set **call
     forwarding** on it to the Twilio number (ask your phone provider). Guests
     keep calling the number they already know.
3. Open the number → **Voice configuration → "A call comes in"**:
   **Webhook**, URL `https://slambar.gr/api/voice/incoming`, **HTTP POST**. Save.
   (The same address is shown, with a Copy button, in Manager → Τηλεφωνητής.)
4. Copy your **Auth Token** from the Twilio Console home page (Account Info).

## 3. Put the keys on the server (≈5 min)

The keys live in `/home/slam/slam.env` — outside the app folder, so deploys
never touch them. As root on the server:

```bash
cat > /home/slam/slam.env <<'EOF'
ANTHROPIC_API_KEY=sk-ant-...your key...
TWILIO_AUTH_TOKEN=...your Twilio auth token...
PUBLIC_URL=https://slambar.gr
TRUST_PROXY=1
EOF
chown slam:slam /home/slam/slam.env && chmod 600 /home/slam/slam.env
systemctl restart slam
```

Manager → Τηλεφωνητής should now show two green ticks.

## 4. Teach it about the bar (≈10 min)

Manager → **Τηλεφωνητής → "Τι ξέρει ο τηλεφωνητής"**. Fill in:

- **Τηλέφωνο μπαρ για μεταφορά** — the number a human answers (+30…). Without it
  the agent can't put anyone through; it takes a message instead.
- **Ωράριο, Τιμή ομπρέλας, Μέχρι πότε κρατάμε την ομπρέλα, Άλλες πληροφορίες.**
  Anything left empty, the agent says it doesn't know — it never invents prices
  or hours.
- **Άτομα ανά ομπρέλα** (default 2), **Κρατήσεις έως** (days ahead),
  **season start/end** and **closed days** — the agent refuses dates outside these.

## 5. Test before going live

1. **In the browser:** Manager → Τηλεφωνητής → "Δοκιμή στον browser" → 📞 Κλήση.
   Talk (Chrome/Safari) or type. Bookings it makes are real, marked "🧪 Δοκιμή" —
   cancel them afterwards in Κρατήσεις.
2. **Real call:** ring the Twilio number from a mobile. Try: a booking in Greek,
   pressing 2 and booking in English, cancelling with the code, asking for a
   person, interrupting it mid-sentence.
3. Read the transcripts under **Πρόσφατες κλήσεις**.

If the Greek voice or recognition sounds wrong, the "advanced" section in the
settings lets you change provider/voice (defaults: Google `el-GR-Wavenet-B`
voice, Deepgram `nova-3-general` recognition).

## Switching it off

Untick **"Ο τηλεφωνητής απαντά στις κλήσεις"** — calls then ring straight
through to the bar number. If Claude is ever unreachable mid-call, the agent
apologises and transfers (or asks the guest to call back if no bar number is set).

## Costs (rough)

- **Claude:** pay per use. A typical 2–3 minute booking call should come to
  roughly 5–15 cents (Claude Opus 5.5: $4 per million input tokens, $20 per
  million output; most of each call's input is re-read from cache at a
  twentieth of the price). Each call's token count is logged at the end of its
  transcript, so you can check real numbers after the first week.
- **Twilio:** monthly number rental, per-minute inbound call charges, and a
  per-minute ConversationRelay (speech) charge — check twilio.com/pricing for
  Greece; these change.

## Developer notes

- Code: `server/voice/` (agent loop, tools, prompt, Twilio webhooks + WebSocket),
  `server/bookings.js` (booking rules), `src/components/VoicePanel.jsx`,
  `VoiceTester.jsx`, `BookingsPanel.jsx`.
- Offline test (fake Claude, throwaway DB):
  `SLAM_DB=/tmp/slam-test.sqlite node server/voice/test-agent.js`
- Every Twilio request and the call WebSocket are checked against Twilio's
  signature; the browser test line only opens for a logged-in manager.
