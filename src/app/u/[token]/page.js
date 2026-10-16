'use client'
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { api, euro } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { useLang, catLabel } from '@/lib/lang'
import SpotTag from '@/components/SpotTag'
import Icon from '@/components/Icon'

const T = {
  en: {
    menu: 'Menu',
    orders: 'My orders',
    viewCart: 'View order',
    yourOrder: 'Your order',
    itemNote: 'Anything special? (no ice, extra lemon…)',
    orderNote: 'Note for the whole order',
    placeOrder: 'Send order',
    placing: 'Sending…',
    soldOut: 'Sold out',
    callWaiter: 'Call a waiter',
    waiterComing: 'A waiter is coming',
    requestBill: 'Bring the bill',
    billComing: 'The bill is coming',
    runningTotal: 'Your total so far',
    noOrders: 'Nothing ordered yet — the menu is a tap away.',
    statusPlaced: 'We got your order',
    statusAccepted: 'Being made',
    statusReady: 'Ready — heading your way',
    statusPickedUp: 'On its way',
    statusDelivered: 'Delivered — enjoy!',
    statusCancelled: 'Cancelled',
    yourSpot: 'Your spot',
    empty: 'Your order is empty',
  },
  el: {
    menu: 'Μενού',
    orders: 'Οι παραγγελίες μου',
    viewCart: 'Δείτε την παραγγελία',
    yourOrder: 'Η παραγγελία σας',
    itemNote: 'Κάτι ιδιαίτερο; (χωρίς πάγο, έξτρα λεμόνι…)',
    orderNote: 'Σημείωση για όλη την παραγγελία',
    placeOrder: 'Αποστολή παραγγελίας',
    placing: 'Αποστολή…',
    soldOut: 'Εξαντλήθηκε',
    callWaiter: 'Κλήση σερβιτόρου',
    waiterComing: 'Ο σερβιτόρος έρχεται',
    requestBill: 'Φέρτε τον λογαριασμό',
    billComing: 'Ο λογαριασμός έρχεται',
    runningTotal: 'Σύνολο μέχρι τώρα',
    noOrders: 'Δεν έχετε παραγγείλει ακόμα — το μενού είναι ένα άγγιγμα μακριά.',
    statusPlaced: 'Λάβαμε την παραγγελία',
    statusAccepted: 'Ετοιμάζεται',
    statusReady: 'Έτοιμο — έρχεται',
    statusPickedUp: 'Καθ΄ οδόν',
    statusDelivered: 'Παραδόθηκε — καλή απόλαυση!',
    statusCancelled: 'Ακυρώθηκε',
    yourSpot: 'Η θέση σας',
    empty: 'Η παραγγελία σας είναι άδεια',
  },
}

const STATUS_KEY = {
  placed: 'statusPlaced',
  accepted: 'statusAccepted',
  ready: 'statusReady',
  picked_up: 'statusPickedUp',
  delivered: 'statusDelivered',
  cancelled: 'statusCancelled',
}
const STATUS_STEP = { placed: 0, accepted: 1, ready: 2, picked_up: 2, delivered: 3 }

export default function CustomerPage() {
  const { token } = useParams()
  const [lang, toggleLang] = useLang('guestLang', 'en')
  const t = T[lang]
  const [bootstrap, setBootstrap] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [ordersData, setOrdersData] = useState({ orders: [], unsettledTotal: 0, openRequests: [] })
  const [view, setView] = useState('menu')
  const [cart, setCart] = useState({}) // menuItemId -> { qty, note }
  const [cartOpen, setCartOpen] = useState(false)
  const [orderNote, setOrderNote] = useState('')
  const [placing, setPlacing] = useState(false)
  const [error, setError] = useState('')

  const loadBootstrap = useCallback(() => {
    api(`/u/${token}/bootstrap`)
      .then(setBootstrap)
      .catch(() => setNotFound(true))
  }, [token])

  const loadOrders = useCallback(() => {
    api(`/u/${token}/orders`).then(setOrdersData).catch(() => {})
  }, [token])

  useEffect(() => {
    loadBootstrap()
    loadOrders()
    const socket = getSocket()
    const onChanged = ({ type }) => {
      if (type === 'orders' || type === 'requests') loadOrders()
      if (type === 'menu') loadBootstrap()
    }
    socket.on('changed', onChanged)
    return () => socket.off('changed', onChanged)
  }, [loadBootstrap, loadOrders])

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div className="max-w-xs">
          <span className="mx-auto mb-4 w-16 h-16 rounded-full bg-sea-tint text-sea flex items-center justify-center">
            <Icon name="umbrella" size={30} />
          </span>
          <p className="text-fog">This code isn&apos;t linked to an umbrella. Ask any waiter and they&apos;ll sort it out.</p>
        </div>
      </div>
    )
  }
  if (!bootstrap) {
    return <div className="min-h-screen flex items-center justify-center text-fog">Loading…</div>
  }

  const { umbrella, menu } = bootstrap
  const itemName = (item) => (lang === 'el' && item.name_el ? item.name_el : item.name)
  const categories = [...new Set(menu.map((m) => m.category))]

  const cartEntries = Object.entries(cart).filter(([, v]) => v.qty > 0)
  const cartCount = cartEntries.reduce((s, [, v]) => s + v.qty, 0)
  const cartTotal = cartEntries.reduce((s, [id, v]) => {
    const item = menu.find((m) => m.id === Number(id))
    return s + (item ? item.price * v.qty : 0)
  }, 0)

  const setQty = (id, qty) =>
    setCart((c) => ({ ...c, [id]: { note: c[id]?.note || '', ...c[id], qty: Math.max(0, qty) } }))

  const placeOrder = async () => {
    setPlacing(true)
    setError('')
    try {
      await api(`/u/${token}/orders`, {
        method: 'POST',
        body: {
          items: cartEntries.map(([id, v]) => ({ id: Number(id), qty: v.qty, note: v.note })),
          note: orderNote,
        },
      })
      setCart({})
      setOrderNote('')
      setCartOpen(false)
      setView('orders')
      loadOrders()
    } catch (e) {
      setError(e.message)
      loadBootstrap() // an item may have just sold out
    } finally {
      setPlacing(false)
    }
  }

  const requestService = async (type) => {
    try {
      await api(`/u/${token}/requests`, { method: 'POST', body: { type } })
      loadOrders()
    } catch (e) {
      setError(e.message)
    }
  }

  const hasOpenRequest = (type) => ordersData.openRequests.some((r) => r.type === type)

  return (
    <div className="min-h-screen pb-28">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-sand/95 backdrop-blur border-b border-line">
        <div className="max-w-lg mx-auto px-4 pt-3 pb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <SpotTag number={umbrella.number} size="md" tone="sea" />
            <div>
              <div className="font-display font-black uppercase text-2xl leading-none">Slam</div>
              <div className="text-fog text-xs">
                {t.yourSpot} · {umbrella.zone}
              </div>
            </div>
          </div>
          <button
            onClick={toggleLang}
            className="border border-line bg-shell rounded-full px-3 py-1.5 text-sm font-bold text-fog hover:text-ink"
          >
            {lang === 'en' ? 'ΕΛ' : 'EN'}
          </button>
        </div>
        {/* Tabs */}
        <div className="max-w-lg mx-auto px-4 flex gap-1 pb-2">
          {[
            ['menu', t.menu],
            ['orders', `${t.orders}${ordersData.orders.length ? ` · ${ordersData.orders.length}` : ''}`],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`flex-1 rounded-full py-2 text-sm font-bold transition-colors ${
                view === key ? 'bg-ink text-shell' : 'bg-shell text-fog border border-line'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {error && (
        <div className="max-w-lg mx-auto px-4 mt-3">
          <div className="bg-coral-tint text-coral rounded-xl px-4 py-2.5 text-sm font-semibold flex justify-between items-center">
            <span>{error}</span>
            <button onClick={() => setError('')} className="font-bold ml-2 text-lg leading-none" aria-label="Dismiss">×</button>
          </div>
        </div>
      )}

      <main className="max-w-lg mx-auto px-4 py-4">
        {view === 'menu' ? (
          <div className="space-y-7">
            {/* Category chips */}
            <nav className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1" aria-label="Menu categories">
              {categories.map((cat) => (
                <a
                  key={cat}
                  href={`#cat-${encodeURIComponent(cat)}`}
                  className="whitespace-nowrap bg-shell border border-line rounded-full px-3.5 py-1.5 text-sm font-semibold text-fog hover:text-ink hover:border-fog"
                >
                  {catLabel(cat, lang)}
                </a>
              ))}
            </nav>

            {categories.map((cat) => (
              <section key={cat} id={`cat-${encodeURIComponent(cat)}`} className="scroll-mt-32">
                <h2 className="font-display font-extrabold uppercase text-2xl text-ink mb-2.5">{catLabel(cat, lang)}</h2>
                <div className="bg-shell rounded-2xl border border-line divide-y divide-line overflow-hidden">
                  {menu
                    .filter((m) => m.category === cat)
                    .map((item) => {
                      const qty = cart[item.id]?.qty || 0
                      return (
                        <div
                          key={item.id}
                          className={`px-4 py-3.5 flex items-center gap-3 ${!item.available ? 'opacity-45' : ''}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold">{itemName(item)}</div>
                            {item.description && (
                              <div className="text-xs text-fog truncate">{item.description}</div>
                            )}
                            <div className="text-sm text-fog tnum mt-0.5">{euro(item.price)}</div>
                          </div>
                          {!item.available ? (
                            <span className="text-xs font-bold text-coral whitespace-nowrap">{t.soldOut}</span>
                          ) : qty === 0 ? (
                            <button
                              onClick={() => setQty(item.id, 1)}
                              aria-label={`Add ${itemName(item)}`}
                              className="bg-sea hover:bg-sea-deep text-shell w-10 h-10 rounded-full text-xl font-bold leading-none transition-colors"
                            >
                              +
                            </button>
                          ) : (
                            <div className="flex items-center gap-2.5">
                              <button
                                onClick={() => setQty(item.id, qty - 1)}
                                aria-label={`Remove one ${itemName(item)}`}
                                className="border border-line bg-shell w-9 h-9 rounded-full font-bold text-fog hover:text-ink"
                              >
                                −
                              </button>
                              <span className="w-5 text-center font-extrabold tnum">{qty}</span>
                              <button
                                onClick={() => setQty(item.id, qty + 1)}
                                aria-label={`Add one ${itemName(item)}`}
                                className="bg-sea hover:bg-sea-deep text-shell w-9 h-9 rounded-full font-bold"
                              >
                                +
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Service buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => requestService('waiter')}
                disabled={hasOpenRequest('waiter')}
                className={`rounded-2xl py-3.5 px-2 font-bold text-sm border transition-colors ${
                  hasOpenRequest('waiter')
                    ? 'bg-palm-tint text-palm border-palm-tint'
                    : 'bg-shell text-ink border-line hover:border-fog'
                }`}
              >
                {hasOpenRequest('waiter') ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name="check" size={16} />
                    {t.waiterComing}
                  </span>
                ) : (
                  t.callWaiter
                )}
              </button>
              <button
                onClick={() => requestService('bill')}
                disabled={hasOpenRequest('bill')}
                className={`rounded-2xl py-3.5 px-2 font-bold text-sm border transition-colors ${
                  hasOpenRequest('bill')
                    ? 'bg-palm-tint text-palm border-palm-tint'
                    : 'bg-shell text-ink border-line hover:border-fog'
                }`}
              >
                {hasOpenRequest('bill') ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name="check" size={16} />
                    {t.billComing}
                  </span>
                ) : (
                  t.requestBill
                )}
              </button>
            </div>

            {ordersData.unsettledTotal > 0 && (
              <div className="bg-shell rounded-2xl border border-line px-4 py-3.5 flex justify-between items-center">
                <span className="text-fog text-sm font-semibold">{t.runningTotal}</span>
                <span className="font-extrabold text-lg tnum">{euro(ordersData.unsettledTotal)}</span>
              </div>
            )}

            {ordersData.orders.length === 0 && (
              <div className="text-center text-fog py-12 px-6">{t.noOrders}</div>
            )}

            {ordersData.orders.map((order) => {
              const step = STATUS_STEP[order.status]
              const done = order.status === 'delivered'
              return (
                <div key={order.id} className="bg-shell rounded-2xl border border-line p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="font-extrabold tnum">#{order.id}</span>
                    <span
                      className={`text-sm font-bold ${
                        done ? 'text-palm' : order.status === 'cancelled' ? 'text-coral' : 'text-sea'
                      }`}
                    >
                      {t[STATUS_KEY[order.status]]}
                    </span>
                  </div>
                  {order.status !== 'cancelled' && (
                    <div className="flex gap-1.5" role="progressbar" aria-valuenow={step + 1} aria-valuemax={4}>
                      {[0, 1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className={`h-1.5 flex-1 rounded-full transition-colors ${
                            i <= step ? (done ? 'bg-palm' : 'bg-sea') : 'bg-line'
                          }`}
                        />
                      ))}
                    </div>
                  )}
                  <ul className="text-sm text-fog space-y-1">
                    {order.items.map((it) => (
                      <li key={it.id} className="flex justify-between gap-2">
                        <span>
                          <span className="font-bold text-ink tnum">{it.qty}×</span> {it.name}
                          {it.note && <span className="text-fog italic"> — {it.note}</span>}
                        </span>
                        <span className="tnum">{euro(it.price * it.qty)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* Cart bar + sheet */}
      {view === 'menu' && cartCount > 0 && !cartOpen && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-4 left-4 right-4 max-w-lg mx-auto bg-ink text-shell rounded-2xl py-4 px-5 font-bold shadow-lg flex justify-between items-center z-30"
        >
          <span>
            {t.viewCart} · {cartCount}
          </span>
          <span className="tnum">{euro(cartTotal)}</span>
        </button>
      )}

      {cartOpen && (
        <div className="fixed inset-0 z-40 bg-ink/40 flex items-end" onClick={() => setCartOpen(false)}>
          <div
            className="bg-shell w-full max-w-lg mx-auto rounded-t-3xl p-5 space-y-4 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center">
              <h2 className="font-display font-extrabold uppercase text-2xl">{t.yourOrder}</h2>
              <button onClick={() => setCartOpen(false)} className="text-fog text-2xl leading-none" aria-label="Close">×</button>
            </div>
            {cartEntries.length === 0 && <p className="text-fog text-sm">{t.empty}</p>}
            {cartEntries.map(([id, v]) => {
              const item = menu.find((m) => m.id === Number(id))
              if (!item) return null
              return (
                <div key={id} className="border-b border-line pb-3.5 space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold flex-1">{itemName(item)}</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setQty(item.id, v.qty - 1)} aria-label="Remove one" className="border border-line w-8 h-8 rounded-full font-bold text-fog">−</button>
                      <span className="w-5 text-center font-extrabold tnum">{v.qty}</span>
                      <button onClick={() => setQty(item.id, v.qty + 1)} aria-label="Add one" className="bg-sea text-shell w-8 h-8 rounded-full font-bold">+</button>
                    </div>
                    <span className="w-16 text-right font-semibold tnum">{euro(item.price * v.qty)}</span>
                  </div>
                  <input
                    className="w-full text-sm border border-line rounded-xl px-3 py-2 placeholder:text-fog/60"
                    placeholder={t.itemNote}
                    value={v.note}
                    onChange={(e) => setCart((c) => ({ ...c, [id]: { ...c[id], note: e.target.value } }))}
                  />
                </div>
              )
            })}
            <textarea
              className="w-full text-sm border border-line rounded-xl px-3 py-2.5 placeholder:text-fog/60"
              placeholder={t.orderNote}
              rows={2}
              value={orderNote}
              onChange={(e) => setOrderNote(e.target.value)}
            />
            <button
              onClick={placeOrder}
              disabled={placing || cartEntries.length === 0}
              className="w-full bg-sea hover:bg-sea-deep text-shell rounded-2xl py-4 font-extrabold text-lg disabled:opacity-50 transition-colors"
            >
              {placing ? t.placing : `${t.placeOrder} · ${euro(cartTotal)}`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
