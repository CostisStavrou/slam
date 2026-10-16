'use client'
import { useCallback, useEffect, useState } from 'react'
import { api, minutesAgo } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { beep } from '@/lib/sound'
import { useLang, itemLabel } from '@/lib/lang'
import StaffGate from '@/components/StaffGate'
import SpotTag from '@/components/SpotTag'
import Icon from '@/components/Icon'

const T = {
  el: {
    title: 'μπαρ & κουζίνα',
    home: 'Αρχική',
    logout: 'Έξοδος',
    stations: { all: 'Όλα', bar: 'Μπαρ', kitchen: 'Κουζίνα' },
    stock: 'Απόθεμα',
    stockOut: (n) => `Απόθεμα · ${n} εκτός`,
    closeStock: 'Κλείσιμο αποθέματος',
    stockHint: 'Πάτησε ένα προϊόν για να το δηλώσεις εξαντλημένο — χάνεται αμέσως από το μενού των πελατών. Πάτησέ το ξανά όταν επιστρέψει.',
    stockFiltered: (s) => ` Εμφανίζονται μόνο είδη: ${s === 'bar' ? 'μπαρ' : 'κουζίνα'}.`,
    columns: { placed: 'Νέες', accepted: 'Ετοιμάζονται', ready: 'Έτοιμες για παραλαβή' },
    accept: 'Ξεκίνα το',
    ready: 'Έτοιμη ✓',
    via: 'από',
    minAgo: (m) => `${m} λεπτά`,
    cancelConfirm: (id) => `Ακύρωση παραγγελίας #${id};`,
    waiterPinged: 'Ο σερβιτόρος ειδοποιήθηκε — αναμονή παραλαβής',
    empty: 'Τίποτα εδώ',
  },
  en: {
    title: 'bar & kitchen',
    home: 'Home',
    logout: 'Log out',
    stations: { all: 'All', bar: 'Bar', kitchen: 'Kitchen' },
    stock: 'Stock',
    stockOut: (n) => `Stock · ${n} out`,
    closeStock: 'Close stock',
    stockHint: "Tap an item to mark it sold out — it disappears from guests' menus instantly. Tap again when it's back.",
    stockFiltered: (s) => ` Showing ${s} items only.`,
    columns: { placed: 'New', accepted: 'Being made', ready: 'Ready for pickup' },
    accept: 'Start making',
    ready: 'Mark ready',
    via: 'via',
    minAgo: (m) => `${m} min`,
    cancelConfirm: (id) => `Cancel order #${id}?`,
    waiterPinged: 'Waiter pinged — waiting for pickup',
    empty: 'Nothing here',
  },
}

// One color per state, same language as every other screen:
// sun = waiting on you, sea = being made, palm = ready.
const COLUMNS = [
  // New tickets scream until someone starts them — there is no push
  // notification, the color IS the notification.
  { status: 'placed', chip: 'bg-sun-tint text-sun', tone: 'sun', action: 'accept', card: 'bg-sun-tint border-2 border-sun-bright' },
  { status: 'accepted', chip: 'bg-sea-tint text-sea-deep', tone: 'sea', action: 'ready', card: 'bg-shell border border-line' },
  { status: 'ready', chip: 'bg-palm-tint text-palm-deep', tone: 'palm', action: null, card: 'bg-shell border border-line' },
]

function AgePill({ mins, label }) {
  const cls =
    mins >= 10 ? 'bg-coral-tint text-coral' : mins >= 5 ? 'bg-sun-tint text-sun' : 'bg-sand text-fog'
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold tnum ${cls}`}>{label}</span>
}

function Board({ staffName, onLogout }) {
  const [lang, toggleLang] = useLang('staffLang', 'el')
  const t = T[lang]
  const [orders, setOrders] = useState([])
  const [menu, setMenu] = useState([])
  const [stockOpen, setStockOpen] = useState(false)
  const [station, setStation] = useState('all')
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    setStation(localStorage.getItem('station') || 'all')
  }, [])
  const pickStation = (s) => {
    setStation(s)
    localStorage.setItem('station', s)
  }

  const load = useCallback(() => {
    api('/orders?active=1').then(setOrders).catch(() => {})
  }, [])
  const loadMenu = useCallback(() => {
    api('/menu').then(setMenu).catch(() => {})
  }, [])

  useEffect(() => {
    load()
    loadMenu()
    const socket = getSocket()
    const onChanged = ({ type, event }) => {
      if (type === 'orders') {
        load()
        if (event === 'order_placed') beep(2)
      }
      if (type === 'menu') loadMenu()
    }
    socket.on('changed', onChanged)
    const tick = setInterval(() => setNow(Date.now()), 10000)
    return () => {
      socket.off('changed', onChanged)
      clearInterval(tick)
    }
  }, [load, loadMenu])

  const act = async (orderId, action) => {
    try {
      await api(`/orders/${orderId}`, { method: 'PATCH', body: { action, by: staffName } })
    } catch (e) {
      alert(e.message)
      load()
    }
  }

  // Which station is this screen? Kitchen sees food tickets and food stock only.
  const menuById = (id) => menu.find((m) => m.id === id)
  const stationOf = (orderItem) => menuById(orderItem.menu_item_id)?.station || null
  const itemMine = (orderItem) => station === 'all' || stationOf(orderItem) === station || stationOf(orderItem) === null
  const orderMine = (o) => station === 'all' || o.items.some((it) => stationOf(it) === station)
  const stationMenu = menu.filter((m) => station === 'all' || m.station === station)
  const soldOutCount = stationMenu.filter((m) => !m.available).length
  // Order items store the English name; show the Greek one when we can.
  const nameOf = (orderItem) => {
    const m = menuById(orderItem.menu_item_id)
    return m ? itemLabel(m, lang) : orderItem.name
  }

  return (
    <div className="min-h-dvh">
      <header className="bg-shell/95 backdrop-blur border-b border-line sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <h1 className="flex items-baseline gap-2 min-w-0">
            <span className="font-display font-black uppercase text-2xl leading-none">Slam</span>
            <span className="text-sm font-semibold text-fog truncate">{t.title}</span>
          </h1>
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-sm font-semibold text-ink px-1.5 max-w-28 truncate">{staffName}</span>
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
        <div className="max-w-7xl mx-auto px-4 pb-3 flex items-center gap-2 flex-wrap">
          {/* Station switch — set once per tablet, remembered on the device */}
          <div className="flex bg-sand border border-line rounded-full p-1" role="group" aria-label="Station">
            {['all', 'bar', 'kitchen'].map((key) => (
              <button
                key={key}
                onClick={() => pickStation(key)}
                aria-pressed={station === key}
                className={`rounded-full px-5 min-h-10 text-sm font-bold transition-colors ${
                  station === key ? 'bg-ink text-white shadow-sm' : 'text-fog hover:text-ink'
                }`}
              >
                {t.stations[key]}
              </button>
            ))}
          </div>
          <button
            onClick={() => setStockOpen(!stockOpen)}
            aria-expanded={stockOpen}
            className={`btn !min-h-12 text-sm ${soldOutCount > 0 ? 'bg-coral-tint text-coral border border-coral/30' : 'btn-quiet'}`}
          >
            <Icon name={stockOpen ? 'chevronUp' : 'list'} size={18} />
            {stockOpen ? t.closeStock : soldOutCount ? t.stockOut(soldOutCount) : t.stock}
          </button>
        </div>
      </header>

      {stockOpen && (
        <div className="bg-shell border-b border-line p-4 rise-in">
          <p className="text-sm text-fog mb-3 max-w-7xl mx-auto">
            {t.stockHint}
            {station !== 'all' && t.stockFiltered(station)}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2 max-w-7xl mx-auto">
            {stationMenu.map((item) => (
              <button
                key={item.id}
                onClick={() =>
                  api(`/menu/${item.id}`, { method: 'PATCH', body: { available: item.available ? 0 : 1 } }).catch(() => {})
                }
                aria-pressed={!item.available}
                className={`flex items-center gap-2 rounded-xl px-3 min-h-12 text-left text-sm font-semibold border transition-colors ${
                  item.available
                    ? 'bg-shell border-line hover:border-fog'
                    : 'bg-coral-tint border-coral/30 text-coral line-through'
                }`}
              >
                <Icon name={item.available ? 'check' : 'x'} size={16} className={item.available ? 'text-palm' : ''} />
                {itemLabel(item, lang)}
              </button>
            ))}
          </div>
        </div>
      )}

      <main className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-7xl mx-auto items-start">
        {COLUMNS.map((col) => {
          const colOrders = orders.filter((o) => o.status === col.status && orderMine(o))
          return (
            <section key={col.status} className="min-h-[60vh]">
              <h2 className="flex items-center gap-2.5 mb-3 px-1">
                <span
                  className={`rounded-full min-w-9 h-9 px-2.5 inline-flex items-center justify-center font-display text-xl font-black tnum ${
                    col.status === 'placed' && colOrders.length > 0
                      ? 'bg-sun-bright text-shell alert-pulse'
                      : col.chip
                  }`}
                >
                  {colOrders.length}
                </span>
                <span className="font-display font-extrabold uppercase text-2xl leading-none">{t.columns[col.status]}</span>
              </h2>
              <div className="space-y-3">
                {colOrders.map((order) => {
                  const mins = minutesAgo(order.created_at, now)
                  return (
                    <div key={order.id} className={`rounded-2xl p-4 space-y-3 ${col.card}`}>
                      <div className="flex items-start gap-3">
                        <SpotTag number={order.umbrella_number} size="md" tone={col.tone} />
                        <div className="flex flex-1 flex-wrap items-center justify-end gap-1.5 pt-1">
                          {order.placed_by && (
                            <span className="bg-sea-tint text-sea-deep rounded-full px-2.5 py-0.5 text-xs font-bold">
                              {t.via} {order.placed_by}
                            </span>
                          )}
                          <AgePill mins={mins} label={t.minAgo(mins)} />
                          <span className="text-fog text-sm font-bold tnum">#{order.id}</span>
                        </div>
                      </div>
                      <ul className="space-y-1.5">
                        {order.items.map((it) => {
                          const mine = itemMine(it)
                          return (
                            <li key={it.id} className={`text-[15px] leading-snug ${mine ? '' : 'opacity-40'}`}>
                              <span className="inline-flex justify-center min-w-7 bg-sand rounded-md px-1.5 mr-2 font-display font-black text-lg leading-6 tnum">
                                {it.qty}
                              </span>
                              {nameOf(it)}
                              {!mine && (
                                <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-fog">
                                  {stationOf(it) === 'bar' ? t.stations.bar : t.stations.kitchen}
                                </span>
                              )}
                              {it.note && mine && (
                                <div className="text-sun text-sm font-semibold pl-8">↳ {it.note}</div>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                      {order.note && (
                        <div className="bg-shell text-sun border border-sun-bright/40 text-sm font-semibold rounded-xl px-3 py-2">
                          {order.note}
                        </div>
                      )}
                      <div className="flex gap-2 pt-0.5">
                        {col.action && (
                          <button
                            onClick={() => act(order.id, col.action)}
                            className={`btn flex-1 min-h-14 text-base text-white ${
                              col.action === 'accept' ? 'bg-sea hover:bg-sea-deep' : 'bg-palm hover:bg-palm-deep'
                            }`}
                          >
                            <Icon name={col.action === 'accept' ? 'utensils' : 'check'} size={20} />
                            {col.action === 'accept' ? t.accept : t.ready.replace(' ✓', '')}
                          </button>
                        )}
                        {order.status === 'placed' && (
                          <button
                            onClick={() => confirm(t.cancelConfirm(order.id)) && act(order.id, 'cancel')}
                            aria-label={t.cancelConfirm(order.id)}
                            className="btn btn-danger w-14 !px-0 min-h-14"
                          >
                            <Icon name="x" size={22} />
                          </button>
                        )}
                        {order.status === 'ready' && (
                          <div className="flex-1 flex items-center justify-center gap-2 text-palm-deep text-sm font-bold py-3">
                            <Icon name="bell" size={18} />
                            {t.waiterPinged}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
                {colOrders.length === 0 && (
                  <div className="text-fog text-sm text-center py-10 border-2 border-dashed border-line rounded-2xl flex flex-col items-center gap-2">
                    <Icon name={col.status === 'placed' ? 'bell' : col.status === 'accepted' ? 'utensils' : 'glass'} size={26} className="text-line" />
                    {t.empty}
                  </div>
                )}
              </div>
            </section>
          )
        })}
      </main>
    </div>
  )
}

export default function BarPage() {
  return (
    <StaffGate role="bar" title="Bar & kitchen">
      {(name, logout) => <Board staffName={name} onLogout={logout} />}
    </StaffGate>
  )
}
