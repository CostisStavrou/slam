// Offline test of the phone agent: real CallSession, real tools and booking
// logic, with a scripted stand-in for Claude (no API key or network needed).
//   SLAM_DB=/tmp/slam-test.sqlite node server/voice/test-agent.js
const assert = require('node:assert/strict')

if (!process.env.SLAM_DB) {
  console.error('Set SLAM_DB to a throwaway database path — this test writes bookings.')
  process.exit(1)
}

const db = require('../db')
const B = require('../bookings')
const { CallSession, Anthropic } = require('./agent')
const { TOOLS } = require('./tools')
const { getSettings, updateSettings } = require('./settings')
const { twilioSignature, relayTwiml } = require('./twilio')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---- fake Claude: each scripted step is { text, tools, delay } or a function of the request ----
class FakeStream {
  constructor(step) {
    this.handlers = {}
    this.aborted = false
    this.promise = this.run(step)
    this.promise.catch(() => {})
  }
  on(ev, cb) {
    ;(this.handlers[ev] ||= []).push(cb)
    return this
  }
  emit(ev, ...a) {
    for (const h of this.handlers[ev] || []) h(...a)
  }
  abort() {
    this.aborted = true
  }
  async run(step) {
    await sleep(1)
    if (step.throw) throw step.throw
    const content = []
    if (step.text) {
      for (const chunk of step.text.match(/.{1,6}/gs)) {
        await sleep(step.delay || 1)
        if (this.aborted) throw new Anthropic.APIUserAbortError()
        this.emit('text', chunk)
      }
      content.push({ type: 'text', text: step.text })
    }
    for (const t of step.tools || []) {
      this.emit('streamEvent', { type: 'content_block_start', content_block: { type: 'tool_use', name: t.name } })
      content.push({ type: 'tool_use', id: `toolu_${Math.random().toString(36).slice(2)}`, name: t.name, input: t.input })
    }
    if (this.aborted) throw new Anthropic.APIUserAbortError()
    return {
      content,
      stop_reason: step.stop || (step.tools?.length ? 'tool_use' : 'end_turn'),
      usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 900 },
    }
  }
  finalMessage() {
    return this.promise
  }
}

function fakeClient(script) {
  const requests = []
  return {
    requests,
    beta: {
      messages: {
        stream(params) {
          requests.push(JSON.parse(JSON.stringify(params)))
          let step = script.shift()
          if (!step) throw new Error('fake Claude ran out of script')
          if (typeof step === 'function') step = step(params)
          return new FakeStream(step)
        },
      },
    },
  }
}

function harness(script, opts = {}) {
  const sent = []
  const client = fakeClient(script)
  const session = new CallSession({
    client,
    send: (m) => sent.push(m),
    settings: getSettings(),
    callerNumber: opts.from ?? '+306912345678',
    callSid: 'CA_test',
    notify: () => {},
  })
  return { session, sent, client }
}

async function idle(session) {
  for (let i = 0; i < 500; i++) {
    if (!session.running && session.pending.length === 0) return
    await sleep(5)
  }
  throw new Error('session never went idle')
}

const spoken = (sent) =>
  sent
    .filter((m) => m.type === 'text')
    .map((m) => m.token)
    .join('')

function lastToolResult(params) {
  const last = params.messages[params.messages.length - 1]
  return JSON.parse(last.content[0].content)
}

let failures = 0
async function test(name, fn) {
  try {
    await fn()
    console.log(`  ✓ ${name}`)
  } catch (e) {
    failures++
    console.log(`  ✗ ${name}\n    ${e.stack.split('\n').slice(0, 3).join('\n    ')}`)
  }
}

;(async () => {
  updateSettings({ transferNumber: '', maxDaysAhead: 30, seasonStart: '', seasonEnd: '', peoplePerUmbrella: 2 })
  const today = B.athensDate()
  const day = B.addDays(today, 3)
  console.log(`Voice agent tests (today in Athens: ${today}, booking day: ${day})`)

  await test('request shape: Opus 5.5, fallbacks, caching, eager tools, call context after first turn', async () => {
    const { session, client } = harness([{ text: 'Βεβαίως!' }])
    session.handlePrompt('Γεια σας')
    await idle(session)
    const req = client.requests[0]
    assert.equal(req.model, 'claude-opus-5-5')
    assert.equal(req.fallbacks, 'default')
    assert.deepEqual(req.betas, ['server-side-fallback-2026-07-01'])
    assert.deepEqual(req.cache_control, { type: 'ephemeral' })
    assert.equal(req.output_config.effort, 'low')
    assert.ok(req.tools.every((t) => t.eager_input_streaming === true))
    assert.equal(req.thinking, undefined)
    assert.deepEqual(
      req.messages.map((m) => m.role),
      ['user', 'system']
    )
    assert.match(req.messages[1].content, /Calendar: .*\(today\)/)
    assert.match(req.messages[1].content, /last four digits 5678/)
    assert.match(req.system, /NOT SET — you do not know this/) // empty hours/prices are flagged, not invented
    session.close()
  })

  let bookedCode
  await test('full booking: check → book (2 umbrellas side by side, front row) → code → goodbye → hang up', async () => {
    const { session, sent, client } = harness([
      { tools: [{ name: 'check_availability', input: { date: day, umbrellas: 2 } }] },
      (p) => {
        const r = lastToolResult(p)
        assert.equal(r.bookable, true)
        assert.equal(r.group_fits, true)
        return { text: 'Ναι, έχουμε. Σε ποιο όνομα;' }
      },
      { tools: [{ name: 'create_booking', input: { date: day, name: 'Κώστας', party_size: 4, row_preference: 'front' } }] },
      (p) => {
        const r = lastToolResult(p)
        assert.equal(r.ok, true, JSON.stringify(r))
        bookedCode = r.booking.code
        return { text: `Έγινε! Ο κωδικός σας είναι ${bookedCode.split('').join(' ')}.` }
      },
      { tools: [{ name: 'end_call', input: {} }] },
      { text: 'Ευχαριστούμε, γεια σας!' },
    ])
    session.handlePrompt('Θέλω δύο ομπρέλες για τέσσερα άτομα')
    await idle(session)
    assert.match(spoken(sent), /Μισό λεπτό\./) // filler while checking
    session.handlePrompt('Κώστας, ναι σωστό το νούμερο')
    await idle(session)
    session.handlePrompt('Τίποτα άλλο, ευχαριστώ')
    await idle(session)

    const b = B.getBookingByCode(bookedCode)
    assert.equal(b.date, day)
    assert.equal(b.party_size, 4)
    assert.equal(b.phone, '+306912345678')
    assert.equal(b.source, 'phone')
    assert.equal(b.umbrellas.length, 2)
    const [u1, u2] = b.umbrellas.map((n) => ({ row: n[0], col: parseInt(n.slice(1), 10) }))
    assert.equal(u1.row, 'A')
    assert.equal(u2.row, 'A')
    assert.equal(u2.col, u1.col + 1)

    // history is append-only and alternates correctly around tool results
    const roles = client.requests.at(-1).messages.map((m) => m.role)
    assert.deepEqual(roles.slice(0, 4), ['user', 'system', 'assistant', 'user'])

    assert.equal(sent.filter((m) => m.type === 'end').length, 0, 'must not hang up before the goodbye is spoken')
    await sleep(3500)
    const end = sent.find((m) => m.type === 'end')
    assert.ok(end, 'hangs up after the goodbye')
    assert.equal(JSON.parse(end.handoffData).reason, 'hangup')
    session.close()
    const call = db.prepare('SELECT * FROM voice_calls WHERE id = ?').get(session.callId)
    assert.match(call.outcome, new RegExp(`booked ${bookedCode}`))
    assert.ok(JSON.parse(call.transcript).some((t) => t.who === 'caller'))
  })

  await test('same umbrellas cannot be double-booked; a full beach says no', async () => {
    const busyDay = B.addDays(today, 5)
    while (B.availability(busyDay).free > 0) {
      B.createBooking({ date: busyDay, name: 'Filler', count: Math.min(12, B.availability(busyDay).free) })
    }
    assert.throws(
      () => B.createBooking({ date: busyDay, name: 'X', count: 1 }),
      (e) => e instanceof B.BookingError && e.code === 'full'
    )
    const taken = B.getBookingByCode(bookedCode).umbrellas[0]
    assert.throws(
      () => B.createBooking({ date: day, name: 'Y', umbrellaNumbers: [taken] }),
      (e) => e.code === 'spot_taken'
    )
  })

  await test('cancel: refused from another phone without the name, allowed with the name', async () => {
    const { session } = harness(
      [
        { tools: [{ name: 'cancel_booking', input: { code: bookedCode } }] },
        (p) => {
          assert.equal(lastToolResult(p).ok, false)
          return { text: 'Σε ποιο όνομα είναι η κράτηση;' }
        },
        { tools: [{ name: 'cancel_booking', input: { code: bookedCode, name: 'κώστας' } }] },
        (p) => {
          assert.equal(lastToolResult(p).ok, true)
          return { text: 'Ακυρώθηκε.' }
        },
      ],
      { from: '+302421099999' }
    )
    session.handlePrompt('Θέλω να ακυρώσω την κράτηση')
    await idle(session)
    session.handlePrompt('Κώστας')
    await idle(session)
    assert.equal(B.getBookingByCode(bookedCode).status, 'cancelled')
    assert.equal(B.getBookingByCode(bookedCode).umbrellas.length, 0, 'umbrellas are released')
    session.close()
  })

  await test('dates outside the rules are refused by the tool, not by trust', async () => {
    const { session } = harness([
      { tools: [{ name: 'create_booking', input: { date: B.addDays(today, -1), name: 'A', party_size: 2 } }] },
      (p) => {
        assert.match(lastToolResult(p).reason, /passed/)
        return { tools: [{ name: 'check_availability', input: { date: B.addDays(today, 90) } }] }
      },
      (p) => {
        assert.equal(lastToolResult(p).bookable, false)
        return { tools: [{ name: 'check_availability', input: { date: 'next saturday' } }] }
      },
      (p) => {
        assert.match(p.messages.at(-1).content[0].content, /INVALID_INPUT/)
        assert.equal(p.messages.at(-1).content[0].is_error, true)
        return { text: 'Εντάξει.' }
      },
    ])
    session.handlePrompt('...')
    await idle(session)
    session.close()
  })

  await test('interrupt mid-reply: stream aborted, next turn says what the caller heard', async () => {
    const { session, sent, client } = harness([
      { text: 'Λοιπόν, για το Σάββατο έχουμε αρκετές ελεύθερες ομπρέλες μπροστά στη θάλασσα και πίσω', delay: 15 },
      { text: 'Ναι, για την Κυριακή.' },
    ])
    session.handlePrompt('Τι έχετε για Σάββατο;')
    await sleep(60)
    session.handleInterrupt('Λοιπόν, για το Σάββ')
    session.handlePrompt('Όχι, Κυριακή εννοώ')
    await idle(session)
    const second = client.requests[1]
    const lastUser = second.messages.filter((m) => m.role === 'user').at(-1)
    assert.match(lastUser.content, /only heard: "Λοιπόν, για το Σάββ"/)
    assert.match(lastUser.content, /Κυριακή εννοώ/)
    // the cut-off first reply was never added to history, and the call context
    // still sits right before the next model turn
    assert.deepEqual(
      second.messages.map((m) => m.role),
      ['user', 'user', 'system']
    )
    assert.ok(sent.some((m) => m.type === 'text' && m.last === true))
    session.close()
  })

  await test('keypad 2 switches Twilio to English and tells the model', async () => {
    const { session, sent, client } = harness([{ text: 'Hello! How can I help?' }])
    session.handleDtmf('2')
    await idle(session)
    assert.deepEqual(
      sent.find((m) => m.type === 'language'),
      { type: 'language', ttsLanguage: 'en-US', transcriptionLanguage: 'en-US' }
    )
    assert.match(client.requests[0].messages[0].content, /pressed 2/)
    assert.match(client.requests[0].messages[1].content, /Current call language: English/)
    session.close()
  })

  await test('API failure: apologise and transfer when a staff line exists', async () => {
    updateSettings({ transferNumber: '+302423000000' })
    try {
      const { session, sent } = harness([{ throw: new Anthropic.APIConnectionError({ message: 'down' }) }])
      session.handlePrompt('Γεια')
      await idle(session)
      assert.match(spoken(sent), /τεχνικό πρόβλημα.*Σας συνδέω/)
      await sleep(5500)
      assert.equal(JSON.parse(sent.find((m) => m.type === 'end').handoffData).reason, 'transfer')
      session.close()
    } finally {
      updateSettings({ transferNumber: '' })
    }
  })

  await test('unparseable streamed tool input is re-issued once; other errors are not retried', async () => {
    const parseErr = new Anthropic.AnthropicError('Unable to parse tool parameter JSON from model.')
    const a = harness([{ throw: parseErr }, { text: 'Εντάξει.' }])
    a.session.handlePrompt('Γεια')
    await idle(a.session)
    assert.equal(a.client.requests.length, 2)
    assert.match(spoken(a.sent), /Εντάξει/)
    a.session.close()

    const b = harness([{ throw: new TypeError('a bug'), }, { text: 'never' }])
    b.session.handlePrompt('Γεια')
    await idle(b.session)
    assert.equal(b.client.requests.length, 1)
    assert.match(spoken(b.sent), /τεχνικό πρόβλημα/)
    b.session.close()
  })

  await test('transfer without a staff line is refused so the agent offers a message', async () => {
    const { session } = harness([
      { tools: [{ name: 'transfer_to_staff', input: { reason: 'wants a person' } }] },
      (p) => {
        assert.equal(lastToolResult(p).ok, false)
        return { tools: [{ name: 'take_message', input: { name: 'Ελένη', message: 'Γάμος 40 ατόμων τον Ιούνιο' } }] }
      },
      { text: 'Το σημείωσα, θα σας καλέσουν.' },
    ])
    session.handlePrompt('Θέλω να μιλήσω με κάποιον')
    await idle(session)
    const m = db.prepare('SELECT * FROM voice_messages ORDER BY id DESC LIMIT 1').get()
    assert.equal(m.name, 'Ελένη')
    assert.equal(m.phone, '+306912345678')
    session.close()
  })

  await test('season is month-day, every year (and wraps over New Year)', async () => {
    const { dateProblem, seasonText } = require('./tools')
    const y = Number(today.slice(0, 4)) + 1
    const summer = { ...getSettings(), maxDaysAhead: 0, closedDates: '', seasonStart: '05-01', seasonEnd: '09-30' }
    assert.equal(dateProblem(`${y}-08-05`, summer), null)
    assert.equal(dateProblem(`${y}-05-01`, summer), null)
    assert.equal(dateProblem(`${y}-09-30`, summer), null)
    assert.match(dateProblem(`${y}-10-01`, summer), /outside the season \(open from 1 May to 30 September every year\)/)
    assert.match(dateProblem(`${y}-04-30`, summer), /outside the season/)
    const winter = { ...summer, seasonStart: '11-15', seasonEnd: '03-01' }
    assert.equal(dateProblem(`${y}-12-31`, winter), null)
    assert.equal(dateProblem(`${y}-02-10`, winter), null)
    assert.match(dateProblem(`${y}-07-01`, winter), /outside the season/)
    assert.equal(seasonText({ seasonStart: '06-01', seasonEnd: '' }), 'opens on 1 June every year')
    // a full date saved earlier keeps its month and day; nonsense is dropped
    updateSettings({ seasonStart: '2026-05-01', seasonEnd: '13-40' })
    assert.equal(getSettings().seasonStart, '05-01')
    assert.equal(getSettings().seasonEnd, '')
    updateSettings({ seasonStart: '', seasonEnd: '' })
  })

  await test('Twilio signature + TwiML', async () => {
    // Test vector from Twilio's own Node library tests.
    const sig = twilioSignature('12345', 'https://mycompany.com/myapp.php?foo=1&bar=2', {
      CallSid: 'CA1234567890ABCDE',
      Caller: '+14158675309',
      Digits: '1234',
      From: '+14158675309',
      To: '+18005551212',
    })
    assert.equal(sig, 'RSOYDt4T1cUTdK1PDd93/VVr8B8=')
    const twiml = relayTwiml('https://slambar.gr', getSettings())
    assert.match(twiml, /url="wss:\/\/slambar\.gr\/api\/voice\/relay"/)
    assert.doesNotMatch(twiml, /voice=""/) // no ElevenLabs voice chosen yet → leave it to the account default
    updateSettings({ elevenVoiceId: 'VOICE123' })
    const withVoice = relayTwiml('https://slambar.gr', getSettings())
    assert.match(withVoice, /<Language code="el-GR" ttsProvider="ElevenLabs" voice="VOICE123-flash_v2_5"/)
    assert.match(withVoice, /<Language code="en-US" ttsProvider="ElevenLabs" voice="VOICE123-flash_v2_5"/)
    updateSettings({ elevenVoiceId: '' })
    assert.match(twiml, /dtmfDetection="true"/)
    assert.match(twiml, /action="https:\/\/slambar\.gr\/api\/voice\/handoff"/)
  })

  assert.ok(TOOLS.length === 9)
  console.log(failures ? `\n${failures} failed` : '\nall passed')
  process.exit(failures ? 1 : 0)
})()
