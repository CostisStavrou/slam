'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, euro, minutesAgo } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { beep } from '@/lib/sound'
import { useLang, itemLabel, catLabel } from '@/lib/lang'
import StaffGate from '@/components/StaffGate'
import SpotTag from '@/components/SpotTag'
import BeachMap from '@/components/BeachMap'
import BookingsPanel from '@/components/BookingsPanel'
import Icon from '@/components/Icon'

const T = {
  el: {
    title: 'σερβιτόρος',
    home: 'Αρχική',
    logout: 'Έξοδος',
    tabs: { order: 'Νέα', deliveries: 'Παραδόσεις', requests: 'Αιτήματα', tabs: 'Λογαριασμοί' },
    mapHint: 'Παραγγελία από κοντά; Πάτησε την ομπρέλα του πελάτη — η παραγγελία πάει στο μπαρ και γράφεται στον λογαριασμό του.',
    mapLabels: { sea: 'Θάλασσα', free: 'ελεύθερη', busy: 'έχει παραγγελία', waving: 'ζητά σερβιτόρο', bill: 'ζητά λογαριασμό', reserved: 'κρατημένη', other: 'Άλλες θέσεις' },
    tabsMapLabels: { sea: 'Θάλασσα', free: 'ελεύθερη', busy: 'ανοιχτός λογαριασμός', other: 'Άλλες θέσεις' },
    allUmbrellas: '← Όλες οι ομπρέλες',
    orderingFor: 'Παραγγελία για',
    search: 'Αναζήτηση στο μενού… (mojito, φρέντο)',
    noMatch: (q) => `Τίποτα δεν ταιριάζει με «${q}». Δοκίμασε πιο σύντομη λέξη.`,
    soldOut: 'Εξαντλήθηκε',
    itemNote: 'Σημείωση (χωρίς πάγο, έξτρα λεμόνι…)',
    orderNote: 'Σημείωση για το μπαρ (αλλεργία…)',
    sendToBar: 'Αποστολή στο μπαρ',
    addFirst: 'Πρόσθεσε κάτι πρώτα',
    sending: 'Αποστολή…',
    sent: (n) => `Στάλθηκε στο μπαρ — θα γραφτεί στον λογαριασμό της ${n}.`,
    readyBanner: (n) => (n === 1 ? 'Παραγγελία έτοιμη στο πάσο — πάτα εδώ' : `${n} παραγγελίες έτοιμες στο πάσο — πάτα εδώ`),
    requestBanner: (n) => (n === 1 ? 'Πελάτης ζητά κάτι — πάτα εδώ' : `${n} πελάτες ζητούν κάτι — πάτα εδώ`),
    emptyDeliveries: 'Τίποτα για παράδοση τώρα. Θα ακούσεις ειδοποίηση όταν ετοιμαστεί παραγγελία.',
    inYourHands: 'Στα χέρια σου',
    readyAtPass: 'Έτοιμα στο πάσο',
    delivered: 'Παραδόθηκε ✓',
    takeOrder: 'Πάρε την παραγγελία',
    waitingMin: (m) => `περιμένει ${m} λεπτά`,
    emptyRequests: 'Κανείς δεν ζητάει κάτι. Ησυχία στην άμμο.',
    reqWaiter: 'Ζητά σερβιτόρο',
    reqBill: 'Ζητά λογαριασμό',
    minAgo: (m) => `πριν ${m} λεπτά`,
    claim: 'Το ανέλαβα',
    done: 'Ολοκληρώθηκε ✓',
    takeAnOrder: 'Πάρε παραγγελία',
    tabsHint: 'Πάτησε μια ομπρέλα για τον λογαριασμό της. Μπλε σημαίνει ότι χρωστάει.',
    bill: 'Λογαριασμός',
    toPay: 'Προς πληρωμή',
    paidToday: 'Πληρώθηκαν σήμερα',
    nothingUnpaid: 'Τίποτα απλήρωτο σε αυτή την ομπρέλα.',
    closeTab: 'Πληρώθηκε — κλείσιμο λογαριασμού',
    closeConfirm: (n, total) => `Να κλείσει ο λογαριασμός της ${n}; Σύνολο ${total}.`,
  },
  en: {
    title: 'waiter',
    home: 'Home',
    logout: 'Log out',
    tabs: { order: 'New order', deliveries: 'Deliveries', requests: 'Requests', tabs: 'Tabs' },
    mapHint: "Taking an order in person? Tap the guest's umbrella — the order goes to the bar and onto their tab.",
    mapLabels: { sea: 'Sea', free: 'free', busy: 'has order', waving: 'waving', bill: 'wants the bill', reserved: 'reserved', other: 'Other spots' },
    tabsMapLabels: { sea: 'Sea', free: 'free', busy: 'open tab', other: 'Other spots' },
    allUmbrellas: '← All umbrellas',
    orderingFor: 'Ordering for',
    search: 'Search the menu… (mojito, φρέντο)',
    noMatch: (q) => `Nothing matches “${q}”. Try a shorter word.`,
    soldOut: 'Sold out',
    itemNote: 'Note (no ice, extra lemon…)',
    orderNote: 'Note for the bar (allergy…)',
    sendToBar: 'Send to bar',
    addFirst: 'Add something first',
    sending: 'Sending…',
    sent: (n) => `Sent to the bar — ${n} will get it on their tab.`,
    readyBanner: (n) => (n === 1 ? '1 order ready at the pass — tap here' : `${n} orders ready at the pass — tap here`),
    requestBanner: (n) => (n === 1 ? 'A guest needs you — tap here' : `${n} guests need you — tap here`),
    emptyDeliveries: "Nothing to run right now. You'll hear a ping when an order is ready.",
    inYourHands: 'In your hands',
    readyAtPass: 'Ready at the pass',
    delivered: 'Delivered ✓',
    takeOrder: 'Take this order',
    waitingMin: (m) => `waiting ${m} min`,
    emptyRequests: "No one's waving. All quiet on the sand.",
    reqWaiter: 'Wants a waiter',
    reqBill: 'Wants the bill',
    minAgo: (m) => `${m} min ago`,
    claim: "I've got it",
    done: 'Done ✓',
    takeAnOrder: 'Take an order',
    tabsHint: 'Tap an umbrella to see its bill. Blue means they owe something.',
    bill: 'Bill',
    toPay: 'To pay',
    paidToday: 'Paid today',
    nothingUnpaid: 'Nothing unpaid at this umbrella.',
    closeTab: 'Paid — close tab',
    closeConfirm: (n, total) => `Close the tab for ${n}? Total ${total}.`,
  },
}

function WaiterApp({ staffName, onLogout }) {
  const [lang, toggleLang] = useLang('staffLang', 'el')
  const t = T[lang]
  const [orders, setOrders] = useState([])
  const [requests, setRequests] = useState([])
  const [umbrellas, setUmbrellas] = useState([])
  const [menu, setMenu] = useState([])
  const [tab, setTab] = useState('deliveries')
  const [tabUmbrella, setTabUmbrella] = useState('')
  const [tabData, setTabData] = useState(null)
  const [openTabs, setOpenTabs] = useState([])
  const [now, setNow] = useState(Date.now())
  const [reserved, setReserved] = useState(new Set())
  const headerRef = useRef(null)

  // The sticky search bar sits just under the header, whose height changes
  // when the "ready" / "waving" banners appear.
  useEffect(() => {
    const el = headerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--waiter-header', `${el.offsetHeight}px`))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // "New order" composer state
  const [orderSpot, setOrderSpot] = useState(null) // umbrella being ordered for
  const [draft, setDraft] = useState({}) // menuItemId -> { qty, note }
  const [draftNote, setDraftNote] = useState('')
  const [search, setSearch] = useState('')
  const [sending, setSending] = useState(false)
  const [sentMsg, setSentMsg] = useState('')

  const load = useCallback(() => {
    api('/orders?active=1').then(setOrders).catch(() => {})
    api('/requests').then(setRequests).catch(() => {})
    api('/tabs').then(setOpenTabs).catch(() => {})
  }, [])
  const loadMenu = useCallback(() => {
    api('/menu').then(setMenu).catch(() => {})
  }, [])
  const loadUmbrellas = useCallback(() => {
    api('/umbrellas').then(setUmbrellas).catch(() => {})
  }, [])

  useEffect(() => {
    load()
    loadMenu()
    loadUmbrellas()
    const socket = getSocket()
    const onChanged = ({ type, event }) => {
      if (type === 'orders' || type === 'requests') load()
      if (type === 'menu') loadMenu()
      if (type === 'umbrellas') loadUmbrellas()
      if (event === 'order_ready') beep(3)
      if (event === 'request_created') beep(2)
    }
    socket.on('changed', onChanged)
    const tick = setInterval(() => setNow(Date.now()), 10000)
    return () => {
      socket.off('changed', onChanged)
      clearInterval(tick)
    }
  }, [load, loadMenu, loadUmbrellas])

  const loadTab = useCallback((umbrellaId) => {
    if (!umbrellaId) return setTabData(null)
    api(`/umbrellas/${umbrellaId}/tab`).then(setTabData).catch(() => setTabData(null))
  }, [])

  useEffect(() => {
    loadTab(tabUmbrella)
  }, [tabUmbrella, loadTab, orders])

  const act = async (orderId, action) => {
    try {
      await api(`/orders/${orderId}`, { method: 'PATCH', body: { action, by: staffName } })
    } catch (e) {
      alert(e.message)
      load()
    }
  }

  const actRequest = async (id, action) => {
    try {
      await api(`/requests/${id}`, { method: 'PATCH', body: { action, by: staffName } })
    } catch (e) {
      alert(e.message)
      load()
    }
  }

  // ---- New order helpers ----
  const setQty = (id, qty) => setDraft((d) => ({ ...d, [id]: { note: d[id]?.note || '', qty: Math.max(0, qty) } }))
  const setItemNote = (id, note) => setDraft((d) => ({ ...d, [id]: { qty: d[id]?.qty || 0, note } }))
  const draftEntries = Object.entries(draft).filter(([, v]) => v.qty > 0)
  const draftCount = draftEntries.reduce((s, [, v]) => s + v.qty, 0)
  const draftTotal = draftEntries.reduce((s, [id, v]) => {
    const item = menu.find((m) => m.id === Number(id))
    return s + (item ? item.price * v.qty : 0)
  }, 0)

  const sendOrder = async () => {
    setSending(true)
    try {
      await api('/orders', {
        method: 'POST',
        body: {
          umbrellaId: orderSpot.id,
          items: draftEntries.map(([id, v]) => ({ id: Number(id), qty: v.qty, note: v.note })),
          note: draftNote,
          by: staffName,
        },
      })
      setSentMsg(t.sent(orderSpot.number))
      setTimeout(() => setSentMsg(''), 5000)
      setOrderSpot(null)
      setDraft({})
      setDraftNote('')
      setSearch('')
    } catch (e) {
      alert(e.message)
      loadMenu() // an item may have just sold out
    } finally {
      setSending(false)
    }
  }

  const ready = orders.filter((o) => o.status === 'ready')
  const mine = orders.filter((o) => o.status === 'picked_up' && o.claimed_by === staffName)
  const openRequests = requests.filter((r) => r.status === 'open')
  const myRequests = requests.filter((r) => r.status === 'claimed' && r.claimed_by === staffName)
  const deliveryCount = ready.length + mine.length
  const requestCount = openRequests.length + myRequests.length

  const busyUmbrellas = new Set(orders.map((o) => o.umbrella_id))
  const wavingUmbrellas = new Set(requests.filter((r) => r.type === 'waiter').map((r) => r.umbrella_id))
  const billUmbrellas = new Set(requests.filter((r) => r.type === 'bill').map((r) => r.umbrella_id))

  // Order items store the English name snapshot; show Greek when possible.
  const nameOf = (orderItem) => {
    const m = menu.find((x) => x.id === orderItem.menu_item_id)
    return m ? itemLabel(m, lang) : orderItem.name
  }
  const itemsSummary = (order) => order.items.map((it) => `${it.qty}× ${nameOf(it)}`).join(', ')
  const reqLabel = (type) => (type === 'bill' ? t.reqBill : t.reqWaiter)

  // Menu filtered by the composer search box (matches English and Greek names).
  const query = search.trim().toLowerCase()
  const visibleMenu = query
    ? menu.filter((m) => m.name.toLowerCase().includes(query) || (m.name_el || '').toLowerCase().includes(query))
    : menu
  const categories = [...new Set(visibleMenu.map((m) => m.category))]

  const sections = [
    ['order', t.tabs.order, 'plus', 0, ''],
    ['deliveries', t.tabs.deliveries, 'tray', deliveryCount, ready.length > 0 ? 'bg-palm text-white' : 'bg-ink text-white'],
    ['requests', t.tabs.requests, 'hand', requestCount, openRequests.length > 0 ? 'bg-sun-bright text-white' : 'bg-ink text-white'],
    ['tabs', t.tabs.tabs, 'receipt', 0, ''],
  ]

  return (
    <div className="min-h-dvh pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <header ref={headerRef} className="bg-shell/95 backdrop-blur border-b border-line sticky top-0 z-20">
        <div className="max-w-lg mx-auto pl-4 pr-2 h-14 flex justify-between items-center gap-2">
          <h1 className="flex items-baseline gap-2 min-w-0">
            <span className="font-display font-black uppercase text-2xl leading-none">Slam</span>
            <span className="text-sm font-semibold text-fog truncate">{t.title}</span>
          </h1>
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-sm font-semibold text-ink px-1.5 max-w-24 truncate">{staffName}</span>
            <button onClick={toggleLang} className="btn btn-quiet !min-h-11 w-11 !px-0 text-xs" aria-label={lang === 'el' ? 'English' : 'Ελληνικά'}>
              {lang === 'el' ? 'EN' : 'ΕΛ'}
            </button>
            <a href="/" className="btn !min-h-11 w-11 !px-0 text-fog hover:text-ink hover:bg-sand" aria-label={t.home} title={t.home}>
              <Icon name="home" />
            </a>
            <button onClick={onLogout} className="btn !min-h-11 w-11 !px-0 text-fog hover:text-coral hover:bg-coral-tint" aria-label={t.logout} title={t.logout}>
              <Icon name="logout" />
            </button>
          </div>
        </div>

        {/* Big color signals — there are no push notifications, so when
            something needs a waiter it has to be impossible to miss. */}
        {ready.length > 0 && tab !== 'deliveries' && (
          <button
            onClick={() => setTab('deliveries')}
            className="alert-pulse [--glow:rgba(61,122,23,0.5)] flex items-center gap-3 w-full bg-palm text-white text-left px-4 py-3.5 font-bold text-[15px]"
          >
            <Icon name="glass" size={22} />
            <span className="flex-1">{t.readyBanner(ready.length)}</span>
            <Icon name="arrowRight" size={18} />
          </button>
        )}
        {openRequests.length > 0 && tab !== 'requests' && (
          <button
            onClick={() => setTab('requests')}
            className="alert-pulse [--glow:rgba(194,74,18,0.5)] flex items-center gap-3 w-full bg-sun-bright text-white text-left px-4 py-3.5 font-bold text-[15px]"
          >
            <Icon name="hand" size={22} />
            <span className="flex-1">{t.requestBanner(openRequests.length)}</span>
            <Icon name="arrowRight" size={18} />
          </button>
        )}
      </header>

      {/* Sections at the bottom, where a thumb rests */}
      <nav
        className="fixed bottom-0 inset-x-0 z-30 bg-shell/95 backdrop-blur border-t border-line pb-[env(safe-area-inset-bottom)]"
        aria-label="Waiter sections"
      >
        <div className="max-w-lg mx-auto grid grid-cols-4">
          {sections.map(([key, label, icon, count, badgeCls]) => {
            const active = tab === key
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                aria-current={active ? 'page' : undefined}
                className={`relative flex flex-col items-center justify-center gap-1 h-16 text-xs font-bold transition-colors ${
                  active ? 'text-sea' : 'text-fog hover:text-ink'
                }`}
              >
                {active && <span className="absolute top-0 inset-x-6 h-[3px] rounded-b-full bg-sea" aria-hidden="true" />}
                <span className="relative">
                  <Icon name={icon} size={24} strokeWidth={active ? 2.4 : 2} />
                  {count > 0 && (
                    <span className={`absolute -top-2 -right-3 min-w-5 h-5 px-1 rounded-full text-[11px] leading-5 font-extrabold tnum ${badgeCls}`}>
                      {count}
                    </span>
                  )}
                </span>
                <span className="truncate max-w-full px-1">{label}</span>
              </button>
            )
          })}
        </div>
      </nav>

      <main className="max-w-lg mx-auto p-4 space-y-3">
        {sentMsg && (
          <div role="status" className="rise-in flex items-center gap-3 bg-palm-tint text-palm-deep border-2 border-palm rounded-2xl px-4 py-4 text-[15px] font-bold">
            <Icon name="check" size={22} />
            {sentMsg}
          </div>
        )}

        {tab === 'order' && !orderSpot && (
          <div className="space-y-3">
            <BookingsPanel compact onReserved={setReserved} />
            <p className="text-fog text-sm px-1">{t.mapHint}</p>
            <BeachMap
              umbrellas={umbrellas}
              busy={busyUmbrellas}
              waving={wavingUmbrellas}
              bills={billUmbrellas}
              reserved={reserved}
              labels={t.mapLabels}
              onSelect={setOrderSpot}
            />
          </div>
        )}

        {tab === 'order' && orderSpot && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  setOrderSpot(null)
                  setDraft({})
                  setDraftNote('')
                  setSearch('')
                }}
                className="btn btn-quiet !min-h-11 text-sm"
              >
                {t.allUmbrellas}
              </button>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-fog">{t.orderingFor}</span>
                <SpotTag number={orderSpot.number} size="sm" tone="sea" />
              </div>
            </div>

            {/* Search — stays visible while scrolling the menu */}
            <div className="sticky top-[var(--waiter-header,3.5rem)] z-10 bg-sand pt-1 pb-2 -mx-1 px-1">
              <div className="relative">
                <Icon name="search" size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-fog" />
                <input
                  type="search"
                  autoFocus
                  className="field !pl-10 !pr-11"
                  placeholder={t.search}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label={t.search}
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    aria-label="Clear"
                    className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-fog hover:text-ink"
                  >
                    <Icon name="x" size={18} />
                  </button>
                )}
              </div>
            </div>

            {categories.length === 0 && (
              <div className="text-center text-fog py-10">{t.noMatch(search)}</div>
            )}

            {categories.map((cat) => (
              <section key={cat}>
                <h2 className="eyebrow mb-2 px-1">{catLabel(cat, lang)}</h2>
                <div className="card divide-y divide-line overflow-hidden">
                  {visibleMenu
                    .filter((m) => m.category === cat)
                    .map((item) => {
                      const qty = draft[item.id]?.qty || 0
                      return (
                        <div key={item.id} className={`px-4 py-3 ${!item.available ? 'opacity-45' : ''}`}>
                          <div className="flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-[15px]">{itemLabel(item, lang)}</div>
                              <div className="text-sm text-fog tnum">{euro(item.price)}</div>
                            </div>
                            {!item.available ? (
                              <span className="text-xs font-bold text-coral">{t.soldOut}</span>
                            ) : qty === 0 ? (
                              <button
                                onClick={() => setQty(item.id, 1)}
                                aria-label={itemLabel(item, lang)}
                                className="bg-sea hover:bg-sea-deep text-white w-11 h-11 rounded-full flex items-center justify-center active:scale-95 transition"
                              >
                                <Icon name="plus" size={22} />
                              </button>
                            ) : (
                              <div className="flex items-center gap-2">
                                <button onClick={() => setQty(item.id, qty - 1)} aria-label="−" className="border border-line w-11 h-11 rounded-full flex items-center justify-center text-ink hover:border-fog active:scale-95 transition">
                                  <Icon name="minus" size={20} />
                                </button>
                                <span className="w-6 text-center font-display font-black text-2xl tnum">{qty}</span>
                                <button onClick={() => setQty(item.id, qty + 1)} aria-label="+" className="bg-sea text-white w-11 h-11 rounded-full flex items-center justify-center active:scale-95 transition">
                                  <Icon name="plus" size={20} />
                                </button>
                              </div>
                            )}
                          </div>
                          {qty > 0 && (
                            <input
                              className="field mt-2.5"
                              placeholder={t.itemNote}
                              value={draft[item.id]?.note || ''}
                              onChange={(e) => setItemNote(item.id, e.target.value)}
                              aria-label={t.itemNote}
                            />
                          )}
                        </div>
                      )
                    })}
                </div>
              </section>
            ))}

            <input
              aria-label={t.orderNote}
              className="field"
              placeholder={t.orderNote}
              value={draftNote}
              onChange={(e) => setDraftNote(e.target.value)}
            />

            <button
              onClick={sendOrder}
              disabled={sending || draftCount === 0}
              className="btn btn-primary w-full min-h-14 text-lg sticky bottom-[calc(5.75rem+env(safe-area-inset-bottom))] shadow-[var(--shadow-pop)] disabled:!opacity-100 disabled:!bg-line disabled:!text-fog disabled:shadow-none"
            >
              {sending ? t.sending : draftCount === 0 ? t.addFirst : `${t.sendToBar} · ${euro(draftTotal)}`}
            </button>
          </div>
        )}

        {tab === 'deliveries' && (
          <>
            {ready.length === 0 && mine.length === 0 && (
              <div className="text-center text-fog py-14 px-6">
                <span className="mx-auto mb-4 w-16 h-16 rounded-full bg-sea-tint text-sea flex items-center justify-center">
                  <Icon name="umbrella" size={30} />
                </span>
                <p className="max-w-xs mx-auto">{t.emptyDeliveries}</p>
              </div>
            )}

            {mine.length > 0 && (
              <h2 className="eyebrow px-1">{t.inYourHands}</h2>
            )}
            {mine.map((order) => (
              <div key={order.id} className="card p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <SpotTag number={order.umbrella_number} size="lg" tone="sea" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] text-ink">{itemsSummary(order)}</div>
                    <div className="text-xs text-fog/70 font-bold tnum mt-0.5">#{order.id} · {order.umbrella_zone}</div>
                  </div>
                </div>
                <button
                  onClick={() => act(order.id, 'deliver')}
                  className="btn btn-primary w-full min-h-13 text-base"
                >
                  <Icon name="check" size={20} />
                  {t.delivered.replace(' ✓', '')}
                </button>
              </div>
            ))}

            {ready.length > 0 && (
              <h2 className="eyebrow px-1 pt-2">{t.readyAtPass}</h2>
            )}
            {ready.map((order) => {
              const waitMins = minutesAgo(order.ready_at, now)
              const late = waitMins >= 5
              return (
                <div
                  key={order.id}
                  className={`rounded-2xl border-2 p-4 space-y-3 ${
                    late ? 'bg-coral-tint border-coral' : 'bg-palm-tint border-palm'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <SpotTag number={order.umbrella_number} size="lg" tone="palm" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] text-ink font-semibold">{itemsSummary(order)}</div>
                      <div className={`text-xs font-bold tnum mt-0.5 ${late ? 'text-coral' : 'text-palm-deep/80'}`}>
                        #{order.id} · {t.waitingMin(waitMins)}
                      </div>
                    </div>
                  </div>
                  {order.note && (
                    <div className="bg-sun-tint text-sun text-sm font-semibold rounded-xl px-3 py-2">{order.note}</div>
                  )}
                  <button
                    onClick={() => act(order.id, 'pickup')}
                    className={`btn w-full min-h-14 text-base text-white ${
                      late ? 'bg-coral hover:brightness-95' : 'bg-palm hover:bg-palm-deep'
                    }`}
                  >
                    {t.takeOrder}
                  </button>
                </div>
              )
            })}
          </>
        )}

        {tab === 'requests' && (
          <>
            {openRequests.length === 0 && myRequests.length === 0 && (
              <div className="text-center text-fog py-14 px-6">
                <span className="mx-auto mb-4 w-16 h-16 rounded-full bg-sea-tint text-sea flex items-center justify-center">
                  <Icon name="waves" size={30} />
                </span>
                <p className="max-w-xs mx-auto">{t.emptyRequests}</p>
              </div>
            )}
            {myRequests.map((r) => (
              <div key={r.id} className="card p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <SpotTag number={r.umbrella_number} size="lg" tone="sea" />
                  <span className="font-bold flex-1">{reqLabel(r.type)}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const u = umbrellas.find((x) => x.id === r.umbrella_id)
                      if (u) {
                        setOrderSpot(u)
                        setTab('order')
                      }
                    }}
                    className="btn btn-quiet flex-1 min-h-13"
                  >
                    {t.takeAnOrder}
                  </button>
                  <button
                    onClick={() => actRequest(r.id, 'done')}
                    className="btn btn-primary flex-1 min-h-13"
                  >
                    <Icon name="check" size={20} />
                    {t.done.replace(' ✓', '')}
                  </button>
                </div>
              </div>
            ))}
            {openRequests.map((r) => (
              <div key={r.id} className="bg-sun-tint rounded-2xl border-2 border-sun-bright p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <SpotTag number={r.umbrella_number} size="lg" tone="sun" />
                  <div className="flex-1">
                    <div className="font-extrabold text-[15px]">{reqLabel(r.type)}</div>
                    <div className="text-xs text-sun font-bold tnum">{t.minAgo(minutesAgo(r.created_at, now))}</div>
                  </div>
                </div>
                <button
                  onClick={() => actRequest(r.id, 'claim')}
                  className="btn w-full min-h-14 text-base text-white bg-sun-bright hover:bg-sun"
                >
                  {t.claim}
                </button>
              </div>
            ))}
          </>
        )}

        {tab === 'tabs' && (
          <div className="space-y-3">
            <p className="text-fog text-sm px-1">{t.tabsHint}</p>
            <BeachMap
              umbrellas={umbrellas}
              busy={new Set(openTabs.map((x) => x.umbrella_id))}
              labels={t.tabsMapLabels}
              showAlerts={false}
              onSelect={(u) => setTabUmbrella(String(u.id))}
            />

            {tabData && (
              <div className="card p-5 space-y-4 rise-in">
                <div className="flex items-center gap-3">
                  <SpotTag number={tabData.umbrella.number} size="md" tone="ink" />
                  <h2 className="font-display font-extrabold uppercase text-2xl">{t.bill}</h2>
                </div>

                {/* Still to pay */}
                <div className="space-y-2">
                  <div className="flex justify-between items-baseline">
                    <h3 className="eyebrow">{t.toPay}</h3>
                    <span className="font-display font-black text-4xl tnum">{euro(tabData.total)}</span>
                  </div>
                  {tabData.orders.length === 0 ? (
                    <p className="text-fog text-sm">{t.nothingUnpaid}</p>
                  ) : (
                    <ul className="text-[15px] text-ink space-y-1.5">
                      {tabData.orders.flatMap((o) =>
                        o.items.map((it) => (
                          <li key={it.id} className="flex justify-between">
                            <span>
                              <span className="font-bold text-ink tnum">{it.qty}×</span> {nameOf(it)}
                            </span>
                            <span className="tnum">{euro(it.price * it.qty)}</span>
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </div>

                {/* Already paid today */}
                {tabData.paidOrders?.length > 0 && (
                  <div className="space-y-2 border-t border-line pt-3">
                    <div className="flex justify-between items-baseline">
                      <h3 className="eyebrow">{t.paidToday}</h3>
                      <span className="font-bold text-fog tnum">{euro(tabData.paidTotal)}</span>
                    </div>
                    <ul className="text-sm text-fog/70 space-y-1">
                      {tabData.paidOrders.flatMap((o) =>
                        o.items.map((it) => (
                          <li key={it.id} className="flex justify-between">
                            <span>
                              <span className="tnum">{it.qty}×</span> {nameOf(it)}
                            </span>
                            <span className="tnum">{euro(it.price * it.qty)}</span>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                )}

                {tabData.orders.length > 0 && (
                  <button
                    onClick={() =>
                      confirm(t.closeConfirm(tabData.umbrella.number, euro(tabData.total))) &&
                      api(`/umbrellas/${tabData.umbrella.id}/settle`, { method: 'POST', body: {} }).then(() =>
                        loadTab(tabUmbrella)
                      )
                    }
                    className="btn w-full min-h-14 text-base text-white bg-palm hover:bg-palm-deep"
                  >
                    <Icon name="check" size={20} />
                    {t.closeTab}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

export default function WaiterPage() {
  return (
    <StaffGate role="waiter" title="Waiter">
      {(name, logout) => <WaiterApp staffName={name} onLogout={logout} />}
    </StaffGate>
  )
}
