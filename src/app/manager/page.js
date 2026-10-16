'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { api, euro } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { useLang, catLabel, itemLabel } from '@/lib/lang'
import SpotTag from '@/components/SpotTag'
import StaffGate from '@/components/StaffGate'
import BookingsPanel from '@/components/BookingsPanel'
import VoicePanel from '@/components/VoicePanel'
import Icon from '@/components/Icon'

const CATEGORIES = ['Cocktails', 'Beer & Wine', 'Coffee', 'Soft Drinks', 'Food', 'Snacks & Sweets']

const STATUS_CHIP = {
  placed: 'bg-sun-tint text-sun',
  accepted: 'bg-sea-tint text-sea-deep',
  ready: 'bg-palm-tint text-palm-deep',
  picked_up: 'bg-sea-tint text-sea-deep',
}

const T = {
  el: {
    title: 'διαχείριση',
    website: 'Η ιστοσελίδα',
    logout: 'Έξοδος',
    everyDay: 'Κάθε μέρα',
    setUp: 'Ρυθμίσεις',
    more: 'Περισσότερα',
    account: 'Λογαριασμός',
    close: 'Κλείσιμο',
    language: 'Γλώσσα',
    otherLang: 'English',
    nav: { overview: 'Επισκόπηση', bookings: 'Κρατήσεις', phone: 'Τηλεφωνητής', analytics: 'Στατιστικά', menu: 'Μενού', umbrellas: 'Ομπρέλες & QR', team: 'Ομάδα' },
    months: ['Ιαν', 'Φεβ', 'Μάρ', 'Απρ', 'Μάι', 'Ιούν', 'Ιούλ', 'Αύγ', 'Σεπ', 'Οκτ', 'Νοέ', 'Δεκ'],
    status: { placed: 'νέα', accepted: 'ετοιμάζεται', ready: 'έτοιμη', picked_up: 'καθ’ οδόν' },
    ordersToday: 'Παραγγελίες σήμερα',
    revenueToday: 'Έσοδα σήμερα',
    activeOrders: 'Ενεργές παραγγελίες',
    openRequests: 'Ανοιχτά αιτήματα',
    liveOrders: 'Παραγγελίες σε εξέλιξη',
    noActive: 'Καμία ενεργή παραγγελία. Οι νέες εμφανίζονται εδώ ζωντανά.',
    serviceRequests: 'Αιτήματα εξυπηρέτησης',
    noneOpen: 'Κανένα ανοιχτό.',
    wantsBill: 'ζητά λογαριασμό',
    wantsWaiter: 'ζητά σερβιτόρο',
    onIt: (n) => `το ανέλαβε: ${n}`,
    unclaimed: 'σε αναμονή',
    topToday: 'Κορυφαία σήμερα',
    noOrdersYet: 'Καμία παραγγελία σήμερα ακόμα.',
    ranges: { today: 'Σήμερα', '7d': '7 ημέρες', '30d': '30 ημέρες', year: 'Φέτος', all: 'Από την αρχή' },
    loading: 'Φόρτωση…',
    revenue: 'Έσοδα',
    orders: 'Παραγγελίες',
    avgOrder: 'Μέση παραγγελία',
    itemsSold: 'Τεμάχια',
    byMonth: 'Έσοδα ανά μήνα — τελευταίοι 12 μήνες',
    busyHours: 'Ώρες αιχμής (παραγγελίες ανά ώρα)',
    busyHoursHint: 'Χρήσιμο για να αποφασίσεις πότε ξεκινά ο επιπλέον σερβιτόρος.',
    serviceSpeed: 'Ταχύτητα εξυπηρέτησης',
    avgPrep: 'μ.ό. παραγγελία → έτοιμη',
    avgDeliver: 'μ.ό. έτοιμη → παράδοση',
    howGuestsOrder: 'Πώς παραγγέλνουν οι πελάτες',
    fromPhone: 'Από το κινητό τους (QR)',
    throughWaiter: 'Μέσω σερβιτόρου',
    nOrders: (v) => `${v} παραγγελίες`,
    topSellers: 'Κορυφαία σε πωλήσεις',
    item: 'Προϊόν',
    sold: 'Πωλήσεις',
    byCategory: 'Έσοδα ανά κατηγορία',
    byRow: 'Έσοδα ανά σειρά',
    byRowHint: 'Αν η πρώτη σειρά αποφέρει πολύ περισσότερα, οι ξαπλώστρες της σηκώνουν υψηλότερη τιμή.',
    teamStats: 'Ομάδα',
    noStaffActivity: 'Καμία δραστηριότητα προσωπικού στην περίοδο.',
    waiterCol: 'Σερβιτόρος',
    deliveredCol: 'Παραδόσεις',
    takenCol: 'Παραγγελίες από κοντά',
    menuItems: 'Προϊόντα μενού',
    newItemName: 'Όνομα νέου προϊόντος',
    priceEur: 'Τιμή €',
    addItem: 'Προσθήκη',
    name: 'Όνομα',
    category: 'Κατηγορία',
    station: 'Πόστο',
    stationBar: 'Μπαρ',
    stationKitchen: 'Κουζίνα',
    stock: 'Απόθεμα',
    inStock: 'Διαθέσιμο',
    soldOut: 'Εξαντλημένο',
    save: 'Αποθήκευση',
    del: 'Διαγραφή',
    delConfirm: (n) => `Να διαγραφεί το «${n}» από το μενού;`,
    teamTitle: 'Ομάδα & PIN',
    teamHint: 'Όλοι συνδέονται από την ιστοσελίδα με το PIN τους. Οι σερβιτόροι βλέπουν την οθόνη σερβιτόρου, το μπαρ τον πίνακα του μπαρ — οι διαχειριστές τα ανοίγουν όλα. PIN διαχειριστή: πάντα 6 ψηφία.',
    role: 'Ρόλος',
    roleWaiter: 'Σερβιτόρος',
    roleBar: 'Μπαρ / Κουζίνα',
    roleManager: 'Διαχειριστής',
    roleLabel: (r) => (r === 'bar' ? 'μπαρ / κουζίνα' : r === 'manager' ? 'διαχειριστής' : 'σερβιτόρος'),
    addMember: 'Προσθήκη μέλους',
    pinHidden: 'Τα PIN αποθηκεύονται κρυπτογραφημένα και δεν εμφανίζονται',
    remove: 'Αφαίρεση',
    removeConfirm: (n) => `Να αφαιρεθεί ο/η ${n} από την ομάδα; Αποσυνδέεται αμέσως από παντού.`,
    logoutAll: 'Αποσύνδεση παντού',
    logoutAllConfirm: (n) => `Να αποσυνδεθεί ο/η ${n} από όλα τα κινητά και τάμπλετ; Θα χρειαστεί να ξαναβάλει το PIN.`,
    loggedOutAll: (n) => `Ο/Η ${n} αποσυνδέθηκε από παντού.`,
    numberPh: 'Αριθμός (Γ1)',
    zone: 'Ζώνη',
    addUmbrella: 'Προσθήκη ομπρέλας',
    printQr: 'Εκτύπωση όλων των QR',
    open: 'Άνοιγμα',
    copyLink: 'Αντιγραφή συνδέσμου',
    scanToOrder: 'Σκάναρε για παραγγελία · Slam Beach Bar',
  },
  en: {
    title: 'manager',
    website: 'Public website',
    logout: 'Log out',
    everyDay: 'Every day',
    setUp: 'Set up',
    more: 'More',
    account: 'Account',
    close: 'Close',
    language: 'Language',
    otherLang: 'Ελληνικά',
    nav: { overview: 'Overview', bookings: 'Bookings', phone: 'Phone agent', analytics: 'Analytics', menu: 'Menu', umbrellas: 'Umbrellas & QR', team: 'Team' },
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    status: { placed: 'new', accepted: 'being made', ready: 'ready', picked_up: 'on its way' },
    ordersToday: 'Orders today',
    revenueToday: 'Revenue today',
    activeOrders: 'Active orders',
    openRequests: 'Open requests',
    liveOrders: 'Live orders',
    noActive: 'No active orders. New ones appear here live.',
    serviceRequests: 'Service requests',
    noneOpen: 'None open.',
    wantsBill: 'wants the bill',
    wantsWaiter: 'wants a waiter',
    onIt: (n) => `${n} is on it`,
    unclaimed: 'unclaimed',
    topToday: 'Top sellers today',
    noOrdersYet: 'No orders yet today.',
    ranges: { today: 'Today', '7d': '7 days', '30d': '30 days', year: 'This year', all: 'All time' },
    loading: 'Loading…',
    revenue: 'Revenue',
    orders: 'Orders',
    avgOrder: 'Average order',
    itemsSold: 'Items sold',
    byMonth: 'Revenue by month — last 12 months',
    busyHours: 'Busy hours (orders per hour of day)',
    busyHoursHint: 'Use this to decide when the extra waiter starts.',
    serviceSpeed: 'Service speed',
    avgPrep: 'avg. order → ready',
    avgDeliver: 'avg. ready → delivered',
    howGuestsOrder: 'How guests order',
    fromPhone: 'From their phone (QR)',
    throughWaiter: 'Through a waiter',
    nOrders: (v) => `${v} orders`,
    topSellers: 'Top sellers',
    item: 'Item',
    sold: 'Sold',
    byCategory: 'Revenue by category',
    byRow: 'Revenue by beach row',
    byRowHint: 'If the front row far outsells the back, its sunbeds can carry a higher price.',
    teamStats: 'Team',
    noStaffActivity: 'No staff activity in this period.',
    waiterCol: 'Waiter',
    deliveredCol: 'Orders delivered',
    takenCol: 'Orders taken in person',
    menuItems: 'Menu items',
    newItemName: 'New item name',
    priceEur: 'Price €',
    addItem: 'Add item',
    name: 'Name',
    category: 'Category',
    station: 'Station',
    stationBar: 'Bar',
    stationKitchen: 'Kitchen',
    stock: 'Stock',
    inStock: 'In stock',
    soldOut: 'Sold out',
    save: 'Save',
    del: 'Delete',
    delConfirm: (n) => `Delete "${n}" from the menu?`,
    teamTitle: 'Team & PINs',
    teamHint: 'Everyone logs in from the website with their PIN. Waiters see the waiter screen, bar staff the bar board — managers can open everything. Manager PINs: always 6 digits.',
    role: 'Role',
    roleWaiter: 'Waiter',
    roleBar: 'Bar / Kitchen',
    roleManager: 'Manager',
    roleLabel: (r) => (r === 'bar' ? 'bar / kitchen' : r),
    addMember: 'Add member',
    pinHidden: "PINs are stored securely and can't be displayed",
    remove: 'Remove',
    removeConfirm: (n) => `Remove ${n} from the team? They're logged out everywhere immediately.`,
    logoutAll: 'Log out everywhere',
    logoutAllConfirm: (n) => `Log ${n} out on every phone and tablet? They'll need their PIN again.`,
    loggedOutAll: (n) => `${n} has been logged out everywhere.`,
    numberPh: 'Number (C1)',
    zone: 'Zone',
    addUmbrella: 'Add umbrella',
    printQr: 'Print all QR codes',
    open: 'Open',
    copyLink: 'Copy link',
    scanToOrder: 'Scan to order · Slam Beach Bar',
  },
}

function Eyebrow({ children }) {
  return <h2 className="eyebrow mb-3">{children}</h2>
}

// Vertical bar chart, no library — heights are % of the max value.
function MonthChart({ data, months }) {
  const max = Math.max(1, ...data.map((d) => d.revenue))
  return (
    <div className="flex items-end gap-1.5 h-44">
      {data.map((d) => {
        const [y, m] = d.month.split('-')
        return (
          <div key={d.month} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${months[m - 1]} ${y}: ${euro(d.revenue)} · ${d.orders}`}>
            {d.revenue > 0 && (
              <span className="text-[10px] font-bold text-fog tnum leading-none">
                {d.revenue >= 1000 ? `${(d.revenue / 1000).toFixed(1)}k` : Math.round(d.revenue)}
              </span>
            )}
            <div
              className={`w-full rounded-t-md ${d.revenue > 0 ? 'bg-sea' : 'bg-line'}`}
              style={{ height: `${Math.max(2, (d.revenue / max) * 100)}%` }}
            />
            <span className="text-[10px] font-bold text-fog">{months[m - 1]}</span>
          </div>
        )
      })}
    </div>
  )
}

function HourChart({ data }) {
  const hours = Array.from({ length: 15 }, (_, i) => i + 8) // 08:00–22:00
  const byHour = Object.fromEntries(data.map((d) => [d.hour, d.orders]))
  const max = Math.max(1, ...hours.map((h) => byHour[h] || 0))
  return (
    <div className="flex items-end gap-1 h-28">
      {hours.map((h) => (
        <div key={h} className="flex-1 flex flex-col items-center gap-1" title={`${h}:00 — ${byHour[h] || 0}`}>
          <div
            className={`w-full rounded-t ${byHour[h] ? 'bg-sun-bright' : 'bg-line'}`}
            style={{ height: `${Math.max(3, ((byHour[h] || 0) / max) * 100)}%` }}
          />
          <span className="text-[9px] font-bold text-fog">{h}</span>
        </div>
      ))}
    </div>
  )
}

// Horizontal bars for share-of-total breakdowns.
function HBarList({ rows, format }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex justify-between text-sm mb-1">
            <span className="font-semibold truncate">{r.label}</span>
            <span className="text-fog tnum whitespace-nowrap ml-2">{format(r.value)}</span>
          </div>
          <div className="h-2 bg-sand rounded-full overflow-hidden">
            <div className="h-full bg-sea rounded-full" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function MenuRow({ item, onChange, onDelete, t, lang }) {
  const [draft, setDraft] = useState(item)
  useEffect(() => setDraft(item), [item])
  const dirty =
    draft.name !== item.name || Number(draft.price) !== item.price || draft.category !== item.category || draft.station !== item.station

  const input = 'w-full border border-line rounded-lg px-2 py-1.5 text-sm bg-shell'
  return (
    <tr className="border-b border-line">
      <td className="py-2 pr-2">
        <input className={input} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      </td>
      <td className="py-2 pr-2 w-24">
        <input
          type="number"
          step="0.5"
          className={`${input} tnum`}
          value={draft.price}
          onChange={(e) => setDraft({ ...draft, price: e.target.value })}
        />
      </td>
      <td className="py-2 pr-2 w-40">
        <select className={input} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
          {[...new Set([...CATEGORIES, draft.category])].map((c) => (
            <option key={c} value={c}>{catLabel(c, lang)}</option>
          ))}
        </select>
      </td>
      <td className="py-2 pr-2 w-28">
        <select className={input} value={draft.station} onChange={(e) => setDraft({ ...draft, station: e.target.value })}>
          <option value="bar">{t.stationBar}</option>
          <option value="kitchen">{t.stationKitchen}</option>
        </select>
      </td>
      <td className="py-2 pr-2 text-center w-24">
        <button
          onClick={() => onChange(item.id, { available: item.available ? 0 : 1 })}
          className={`rounded-full px-3 py-1 text-xs font-extrabold ${
            item.available ? 'bg-palm-tint text-palm-deep' : 'bg-coral-tint text-coral'
          }`}
        >
          {item.available ? t.inStock : t.soldOut}
        </button>
      </td>
      <td className="py-2 text-right w-32 whitespace-nowrap">
        {dirty && (
          <button
            onClick={() => onChange(item.id, { name: draft.name, price: Number(draft.price), category: draft.category, station: draft.station })}
            className="bg-sea hover:bg-sea-deep text-shell rounded-lg px-3 py-1.5 text-xs font-extrabold mr-2"
          >
            {t.save}
          </button>
        )}
        <button
          onClick={() => confirm(t.delConfirm(item.name)) && onDelete(item.id)}
          aria-label={t.delConfirm(item.name)}
          className="text-fog hover:text-coral text-sm font-bold"
        >
          {t.del}
        </button>
      </td>
    </tr>
  )
}

function UmbrellaCard({ umbrella, t }) {
  const [qr, setQr] = useState('')
  const url = typeof window !== 'undefined' ? `${window.location.origin}/u/${umbrella.token}` : ''

  useEffect(() => {
    if (url) QRCode.toDataURL(url, { width: 200, margin: 1, color: { dark: getComputedStyle(document.documentElement).getPropertyValue('--navy-950').trim() || '#000000' } }).then(setQr).catch(() => {})
  }, [url])

  return (
    <div className="bg-shell rounded-2xl border border-line p-4 text-center space-y-2 break-inside-avoid">
      <div className="flex justify-center">
        <SpotTag number={umbrella.number} size="md" tone="ink" />
      </div>
      <div className="text-xs text-fog font-semibold">{umbrella.zone}</div>
      {qr && <img src={qr} alt={`QR — ${umbrella.number}`} className="mx-auto w-36 h-36" />}
      <div className="flex gap-3 justify-center print:hidden">
        <a href={url} target="_blank" className="text-sea text-xs font-bold hover:underline">
          {t.open}
        </a>
        <button onClick={() => navigator.clipboard.writeText(url)} className="text-fog text-xs font-bold hover:underline">
          {t.copyLink}
        </button>
      </div>
      <div className="hidden print:block text-xs text-fog">{t.scanToOrder}</div>
    </div>
  )
}

// Sections, grouped by how often the manager opens them.
const DAILY = [
  ['overview', 'grid'],
  ['bookings', 'calendar'],
  ['phone', 'phone'],
]
const SETUP = [
  ['analytics', 'chart'],
  ['menu', 'utensils'],
  ['umbrellas', 'umbrella'],
  ['team', 'users'],
]

function Badge({ count, tone, className = '' }) {
  if (!count) return null
  return (
    <span className={`min-w-5 h-5 px-1.5 rounded-full text-[11px] leading-5 text-center font-semibold tnum ${tone} ${className}`}>{count}</span>
  )
}

// Name, language, public website and log out — one button, one small menu.
function AccountMenu({ staffName, t, toggleLang, onLogout, up = false, dark = false }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  const initial = (staffName || '?').slice(0, 1).toUpperCase()
  const item = 'w-full flex items-center gap-3 px-3 min-h-10 rounded-lg text-sm text-ink hover:bg-sand transition-colors'
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t.account}: ${staffName}`}
        className={`flex items-center gap-2.5 rounded-xl transition-colors ${
          up ? `w-full px-2.5 min-h-12 ${dark ? 'text-white hover:bg-white/10' : 'hover:bg-sand'}` : 'p-1 hover:bg-white/10'
        }`}
      >
        <span className="w-8 h-8 rounded-full bg-slam text-night text-sm font-semibold flex items-center justify-center" aria-hidden="true">
          {initial}
        </span>
        {up && (
          <>
            <span className="text-sm font-medium truncate">{staffName}</span>
            <Icon name="chevronUp" size={16} className={`ml-auto transition-transform ${open ? '' : 'rotate-180'}`} />
          </>
        )}
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute z-50 w-56 card p-1.5 shadow-[var(--shadow-pop)] rise-in ${up ? 'bottom-full mb-2 left-0' : 'top-full mt-2 right-0'}`}
        >
          <div className="px-3 pt-2 pb-2.5 text-xs text-fog border-b border-line mb-1">{staffName}</div>
          <button role="menuitem" onClick={() => { toggleLang(); setOpen(false) }} className={item}>
            <Icon name="globe" size={18} className="text-fog" />
            {t.otherLang}
          </button>
          <a role="menuitem" href="/" className={item}>
            <Icon name="external" size={18} className="text-fog" />
            {t.website}
          </a>
          <button role="menuitem" onClick={onLogout} className={`${item} !text-coral hover:!bg-coral-tint`}>
            <Icon name="logout" size={18} />
            {t.logout}
          </button>
        </div>
      )}
    </div>
  )
}

function ManagerApp({ staffName, onLogout }) {
  const [lang, toggleLang] = useLang('staffLang', 'el')
  const t = T[lang]
  const [tab, setTab] = useState('overview')
  const [menu, setMenu] = useState([])
  const [umbrellas, setUmbrellas] = useState([])
  const [orders, setOrders] = useState([])
  const [requests, setRequests] = useState([])
  const [stats, setStats] = useState(null)
  const [staffList, setStaffList] = useState([])
  const [newItem, setNewItem] = useState({ name: '', price: '', category: CATEGORIES[0], station: 'bar' })
  const [newUmbrella, setNewUmbrella] = useState({ number: '', zone: '' })
  const [newStaff, setNewStaff] = useState({ name: '', role: 'waiter', pin: '' })
  const [range, setRange] = useState('30d')
  const [analytics, setAnalytics] = useState(null)
  const [todayBookings, setTodayBookings] = useState(0)
  const [openMessages, setOpenMessages] = useState(0)

  useEffect(() => {
    if (tab === 'analytics') {
      api(`/stats/analytics?range=${range}`).then(setAnalytics).catch(() => {})
    }
  }, [tab, range])

  const loadAll = useCallback(() => {
    api('/menu').then(setMenu).catch(() => {})
    api('/umbrellas').then(setUmbrellas).catch(() => {})
    api('/orders?active=1').then(setOrders).catch(() => {})
    api('/requests').then(setRequests).catch(() => {})
    api('/stats/today').then(setStats).catch(() => {})
    api('/staff').then(setStaffList).catch(() => {})
    api('/bookings')
      .then((d) => setTodayBookings(d.bookings.filter((b) => b.status !== 'cancelled').length))
      .catch(() => {})
    api('/voice/messages')
      .then((m) => setOpenMessages(m.filter((x) => !x.handled).length))
      .catch(() => {})
  }, [])

  useEffect(() => {
    loadAll()
    const socket = getSocket()
    const onChanged = () => loadAll()
    socket.on('changed', onChanged)
    return () => socket.off('changed', onChanged)
  }, [loadAll])

  const patchMenu = (id, body) => api(`/menu/${id}`, { method: 'PATCH', body }).catch((e) => alert(e.message))
  const deleteMenu = (id) => api(`/menu/${id}`, { method: 'DELETE' }).catch((e) => alert(e.message))
  // Order items store English names; show the menu's Greek name when we can.
  const nameOf = (orderItem) => {
    const m = menu.find((x) => x.id === orderItem.menu_item_id)
    return m ? itemLabel(m, lang) : orderItem.name
  }

  const inputCls = 'field'
  const [moreOpen, setMoreOpen] = useState(false)
  const countOf = (key) => (key === 'bookings' ? todayBookings : key === 'phone' ? openMessages : 0)
  const toneOf = (key) => (key === 'phone' ? 'bg-sun-bright text-night' : 'bg-white text-night')
  const go = (key) => {
    setTab(key)
    setMoreOpen(false)
    window.scrollTo({ top: 0 })
  }
  const inSetup = SETUP.some(([k]) => k === tab)

  const sideItem = ([key, icon]) => {
    const active = tab === key
    return (
      <li key={key}>
        <button
          onClick={() => go(key)}
          aria-current={active ? 'page' : undefined}
          className={`relative w-full flex items-center gap-3 px-3 h-10 rounded-lg text-sm transition-colors ${
            active ? 'bg-white/15 text-white font-medium' : 'text-white/80 hover:text-white hover:bg-white/10'
          }`}
        >
          {active && <span className="absolute left-0 inset-y-2 w-0.5 rounded-r-full bg-slam" aria-hidden="true" />}
          <Icon name={icon} size={18} strokeWidth={1.75} />
          <span className="truncate">{t.nav[key]}</span>
          <Badge count={countOf(key)} tone={toneOf(key)} className="ml-auto" />
        </button>
      </li>
    )
  }

  return (
    <div className="min-h-dvh lg:pl-56 print:pl-0 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0">
      {/* Computer: the sections live in a sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-30 w-56 flex-col bg-night print:hidden" aria-label="Manager">
        <div className="px-5 pt-6 pb-5">
          <p className="text-sm font-medium text-white/85">{lang === 'el' ? 'Διαχείριση' : 'Manager'}</p>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 space-y-5" aria-label="Manager sections">
          <div>
            <h2 className="px-3 mb-1 text-xs font-medium text-white/60">{t.everyDay}</h2>
            <ul className="space-y-px">{DAILY.map(sideItem)}</ul>
          </div>
          <div>
            <h2 className="px-3 mb-1 text-xs font-medium text-white/60">{t.setUp}</h2>
            <ul className="space-y-px">{SETUP.map(sideItem)}</ul>
          </div>
        </nav>
        <div className="p-3 border-t border-white/10">
          <AccountMenu staffName={staffName} t={t} toggleLang={toggleLang} onLogout={onLogout} up dark />
        </div>
      </aside>

      {/* Phone and tablet: slim top bar with the logo and the account button */}
      <header className="lg:hidden sticky top-0 z-30 bg-night print:hidden">
        <div className="px-4 h-14 flex items-center justify-between gap-3">
          <img src="/photos/logo-wide-600.png" alt="Slam Beach Bar" width={600} height={246} className="block h-9 w-auto" />
          <AccountMenu staffName={staffName} t={t} toggleLang={toggleLang} onLogout={onLogout} />
        </div>
      </header>

      {/* Phone and tablet: the daily sections at the bottom, the rest under "More" */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-shell/95 backdrop-blur border-t border-line pb-[env(safe-area-inset-bottom)] print:hidden"
        aria-label="Manager sections"
      >
        <div className="max-w-lg mx-auto grid grid-cols-4">
          {[...DAILY, ['more', 'dots']].map(([key, icon]) => {
            const active = key === 'more' ? inSetup || moreOpen : tab === key && !moreOpen
            const label = key === 'more' ? (inSetup ? t.nav[tab] : t.more) : t.nav[key]
            return (
              <button
                key={key}
                onClick={() => (key === 'more' ? setMoreOpen((o) => !o) : go(key))}
                aria-current={active && key !== 'more' ? 'page' : undefined}
                aria-expanded={key === 'more' ? moreOpen : undefined}
                className={`relative flex flex-col items-center justify-center gap-1 h-16 text-xs font-medium transition-colors ${
                  active ? 'text-sea' : 'text-fog hover:text-ink'
                }`}
              >
                {active && <span className="absolute top-0 inset-x-6 h-[3px] rounded-b-full bg-sea" aria-hidden="true" />}
                <span className="relative">
                  <Icon name={key === 'more' && inSetup ? SETUP.find(([k]) => k === tab)[1] : icon} size={22} strokeWidth={active ? 2 : 1.75} />
                  {key !== 'more' && (
                    <Badge count={countOf(key)} tone={key === 'phone' ? 'bg-sun-bright text-night' : 'bg-ink text-shell'} className="absolute -top-2 -right-3" />
                  )}
                </span>
                <span className="truncate max-w-full px-1">{label}</span>
              </button>
            )
          })}
        </div>
      </nav>

      {moreOpen && (
        <div className="lg:hidden fixed inset-0 z-20 print:hidden" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-night/40" aria-hidden="true" />
          <div
            className="absolute inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] bg-shell rounded-t-3xl border-t border-line p-3 pb-4 rise-in"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={t.setUp}
          >
            <h2 className="eyebrow px-3 pt-2 pb-2">{t.setUp}</h2>
            <div className="max-w-lg mx-auto grid grid-cols-2 gap-2">
              {SETUP.map(([key, icon]) => {
                const active = tab === key
                return (
                  <button
                    key={key}
                    onClick={() => go(key)}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-3 px-4 min-h-13 rounded-xl border text-sm font-medium text-left transition-colors ${
                      active ? 'bg-sea-tint border-sea text-sea-deep' : 'bg-sand border-line text-ink hover:border-fog'
                    }`}
                  >
                    <Icon name={icon} size={20} strokeWidth={1.75} />
                    {t.nav[key]}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 space-y-8">
        {tab === 'bookings' && <BookingsPanel umbrellas={umbrellas} />}
        {tab === 'phone' && <VoicePanel lang={lang} />}
        {tab === 'overview' && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                [t.ordersToday, stats?.orderCount ?? '—'],
                [t.revenueToday, stats ? euro(stats.revenue) : '—'],
                [t.activeOrders, orders.length],
                [t.openRequests, requests.length],
              ].map(([label, value]) => (
                <div key={label} className="card p-5">
                  <div className="eyebrow !text-sm">{label}</div>
                  <div className="font-display font-black text-5xl leading-none mt-2 tnum">{value}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="card p-5">
                <Eyebrow>{t.liveOrders}</Eyebrow>
                {orders.length === 0 && <p className="text-fog text-sm">{t.noActive}</p>}
                <ul className="space-y-2.5 text-sm">
                  {orders.map((o) => (
                    <li key={o.id} className="flex justify-between items-center gap-3 border-b border-line pb-2.5 last:border-0">
                      <span className="flex items-center gap-2.5 min-w-0">
                        <SpotTag number={o.umbrella_number} size="sm" tone="ink" />
                        <span className="truncate">{o.items.map((it) => `${it.qty}× ${nameOf(it)}`).join(', ')}</span>
                      </span>
                      <span className={`text-xs font-extrabold rounded-full px-3 py-1 whitespace-nowrap ${STATUS_CHIP[o.status]}`}>
                        {t.status[o.status]}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-6">
                <div className="card p-5">
                  <Eyebrow>{t.serviceRequests}</Eyebrow>
                  {requests.length === 0 && <p className="text-fog text-sm">{t.noneOpen}</p>}
                  <ul className="space-y-2 text-sm">
                    {requests.map((r) => (
                      <li key={r.id} className="flex justify-between items-center">
                        <span className="flex items-center gap-2.5">
                          <SpotTag number={r.umbrella_number} size="sm" tone="sun" />
                          {r.type === 'bill' ? t.wantsBill : t.wantsWaiter}
                        </span>
                        <span className="text-xs text-fog font-semibold">
                          {r.status === 'claimed' ? t.onIt(r.claimed_by) : t.unclaimed}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="card p-5">
                  <Eyebrow>{t.topToday}</Eyebrow>
                  {!stats?.topItems?.length && <p className="text-fog text-sm">{t.noOrdersYet}</p>}
                  <ul className="space-y-1.5 text-sm">
                    {stats?.topItems?.map((x) => (
                      <li key={x.name} className="flex justify-between">
                        <span>{x.name}</span>
                        <span className="font-extrabold tnum">{x.qty}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </>
        )}

        {tab === 'analytics' && (
          <>
            {/* Period picker */}
            <div className="flex gap-2 flex-wrap">
              {Object.entries(t.ranges).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setRange(key)}
                  className={`rounded-full px-4 py-1.5 text-sm font-bold border transition-colors ${
                    range === key ? 'bg-ink text-shell border-ink' : 'bg-shell text-fog border-line hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {!analytics ? (
              <p className="text-fog">{t.loading}</p>
            ) : (
              <>
                {/* Headline numbers for the period */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    [t.revenue, euro(analytics.summary.revenue)],
                    [t.orders, analytics.summary.orders],
                    [t.avgOrder, euro(analytics.summary.avgOrder)],
                    [t.itemsSold, analytics.summary.itemsSold],
                  ].map(([label, value]) => (
                    <div key={label} className="card p-5">
                      <div className="text-fog text-xs font-extrabold uppercase tracking-widest">{label}</div>
                      <div className="text-3xl font-extrabold mt-1 tnum">{value}</div>
                    </div>
                  ))}
                </div>

                <div className="card p-5">
                  <Eyebrow>{t.byMonth}</Eyebrow>
                  <MonthChart data={analytics.byMonth} months={t.months} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="card p-5">
                    <Eyebrow>{t.busyHours}</Eyebrow>
                    <HourChart data={analytics.byHour} />
                    <p className="text-xs text-fog mt-2">{t.busyHoursHint}</p>
                  </div>

                  <div className="space-y-6">
                    <div className="card p-5">
                      <Eyebrow>{t.serviceSpeed}</Eyebrow>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-3xl font-extrabold tnum">
                            {analytics.timings.avgPrepMin ? `${analytics.timings.avgPrepMin.toFixed(1)}′` : '—'}
                          </div>
                          <div className="text-xs text-fog font-semibold">{t.avgPrep}</div>
                        </div>
                        <div>
                          <div className="text-3xl font-extrabold tnum">
                            {analytics.timings.avgDeliverMin ? `${analytics.timings.avgDeliverMin.toFixed(1)}′` : '—'}
                          </div>
                          <div className="text-xs text-fog font-semibold">{t.avgDeliver}</div>
                        </div>
                      </div>
                    </div>
                    <div className="card p-5">
                      <Eyebrow>{t.howGuestsOrder}</Eyebrow>
                      <HBarList
                        rows={[
                          { label: t.fromPhone, value: analytics.sourceSplit.guest || 0 },
                          { label: t.throughWaiter, value: analytics.sourceSplit.waiter || 0 },
                        ]}
                        format={t.nOrders}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="card p-5">
                    <Eyebrow>{t.topSellers}</Eyebrow>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-fog font-extrabold uppercase tracking-widest border-b border-line">
                          <th className="py-1.5 text-left font-extrabold">{t.item}</th>
                          <th className="text-right font-extrabold">{t.sold}</th>
                          <th className="text-right font-extrabold">{t.revenue}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.topItems.map((x) => (
                          <tr key={x.name} className="border-b border-line last:border-0">
                            <td className="py-2 font-semibold">{x.name}</td>
                            <td className="text-right tnum">{x.qty}</td>
                            <td className="text-right tnum text-fog">{euro(x.revenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="space-y-6">
                    <div className="card p-5">
                      <Eyebrow>{t.byCategory}</Eyebrow>
                      <HBarList
                        rows={analytics.byCategory.map((c) => ({ label: catLabel(c.category, lang), value: c.revenue }))}
                        format={euro}
                      />
                    </div>
                    <div className="card p-5">
                      <Eyebrow>{t.byRow}</Eyebrow>
                      <HBarList
                        rows={analytics.byZone.map((z) => ({ label: z.zone, value: z.revenue }))}
                        format={euro}
                      />
                      <p className="text-xs text-fog mt-2">{t.byRowHint}</p>
                    </div>
                  </div>
                </div>

                <div className="card p-5">
                  <Eyebrow>{t.teamStats}</Eyebrow>
                  {analytics.staff.length === 0 ? (
                    <p className="text-fog text-sm">{t.noStaffActivity}</p>
                  ) : (
                    <table className="w-full text-sm max-w-md">
                      <thead>
                        <tr className="text-xs text-fog font-extrabold uppercase tracking-widest border-b border-line">
                          <th className="py-1.5 text-left font-extrabold">{t.waiterCol}</th>
                          <th className="text-right font-extrabold">{t.deliveredCol}</th>
                          <th className="text-right font-extrabold">{t.takenCol}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.staff.map((s) => (
                          <tr key={s.name} className="border-b border-line last:border-0">
                            <td className="py-2 font-semibold">{s.name}</td>
                            <td className="text-right tnum">{s.delivered}</td>
                            <td className="text-right tnum">{s.taken}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {tab === 'menu' && (
          <div className="card p-5">
            <Eyebrow>{t.menuItems}</Eyebrow>
            <form
              className="flex flex-wrap gap-2 mb-5 items-end"
              onSubmit={async (e) => {
                e.preventDefault()
                if (!newItem.name || !newItem.price) return
                await api('/menu', { method: 'POST', body: { ...newItem, price: Number(newItem.price) } }).catch((err) =>
                  alert(err.message)
                )
                setNewItem({ name: '', price: '', category: newItem.category, station: newItem.station })
              }}
            >
              <label className="flex-1 min-w-48">
                <span className="label">{t.name}</span>
                <input
                  className={inputCls}
                  placeholder={t.newItemName}
                  value={newItem.name}
                  onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                />
              </label>
              <label className="w-28">
                <span className="label">{t.priceEur}</span>
                <input
                  type="number"
                  step="0.5"
                  className={`${inputCls} tnum`}
                  placeholder={t.priceEur}
                  value={newItem.price}
                  onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
                />
              </label>
              <label className="min-w-40">
                <span className="label">{t.category}</span>
                <select className={inputCls} value={newItem.category} onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{catLabel(c, lang)}</option>
                  ))}
                </select>
              </label>
              <label className="min-w-32">
                <span className="label">{t.station}</span>
                <select className={inputCls} value={newItem.station} onChange={(e) => setNewItem({ ...newItem, station: e.target.value })}>
                  <option value="bar">{t.stationBar}</option>
                  <option value="kitchen">{t.stationKitchen}</option>
                </select>
              </label>
              <button className="btn btn-primary">
                {t.addItem}
              </button>
            </form>
            <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs text-fog font-extrabold uppercase tracking-widest border-b border-line">
                  <th className="py-2 font-extrabold">{t.name}</th>
                  <th className="font-extrabold">{t.priceEur}</th>
                  <th className="font-extrabold">{t.category}</th>
                  <th className="font-extrabold">{t.station}</th>
                  <th className="text-center font-extrabold">{t.stock}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {menu.map((item) => (
                  <MenuRow key={item.id} item={item} onChange={patchMenu} onDelete={deleteMenu} t={t} lang={lang} />
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}

        {tab === 'team' && (
          <div className="bg-shell rounded-2xl border border-line p-5 sm:p-6">
            <Eyebrow>{t.teamTitle}</Eyebrow>
            <p className="text-sm text-fog mb-5 max-w-3xl">{t.teamHint}</p>
            <form
              className="flex flex-wrap gap-2 mb-5 items-end"
              onSubmit={async (e) => {
                e.preventDefault()
                if (!newStaff.name || !newStaff.pin) return
                await api('/staff', { method: 'POST', body: newStaff }).catch((err) => alert(err.message))
                setNewStaff({ name: '', role: newStaff.role, pin: '' })
                loadAll()
              }}
            >
              <label className="flex-1 min-w-44">
                <span className="label">{t.name}</span>
                <input
                  className={inputCls}
                  placeholder={t.name}
                  value={newStaff.name}
                  onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })}
                />
              </label>
              <label className="min-w-40">
                <span className="label">{t.role}</span>
                <select
                  className={inputCls}
                  value={newStaff.role}
                  onChange={(e) => setNewStaff({ ...newStaff, role: e.target.value })}
                >
                  <option value="waiter">{t.roleWaiter}</option>
                  <option value="bar">{t.roleBar}</option>
                  <option value="manager">{t.roleManager}</option>
                </select>
              </label>
              <label className="w-32">
                <span className="label">{"PIN"}</span>
                <input
                  className={`${inputCls} tnum`}
                  placeholder={newStaff.role === 'manager' ? 'PIN (6)' : 'PIN (4–6)'}
                  inputMode="numeric"
                  maxLength={6}
                  value={newStaff.pin}
                  onChange={(e) => setNewStaff({ ...newStaff, pin: e.target.value.replace(/\D/g, '') })}
                />
              </label>
              <button className="btn btn-primary">
                {t.addMember}
              </button>
            </form>
            <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="text-xs text-fog font-extrabold uppercase tracking-widest border-b border-line">
                  <th className="py-2 text-left font-extrabold">{t.name}</th>
                  <th className="text-left font-extrabold">{t.role}</th>
                  <th className="text-left font-extrabold">PIN</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {staffList.map((s) => (
                  <tr key={s.id} className="border-b border-line last:border-0">
                    <td className="py-2.5 font-semibold">{s.name}</td>
                    <td className="capitalize">{t.roleLabel(s.role)}</td>
                    <td className="text-fog" title={t.pinHidden}>••••</td>
                    <td className="text-right whitespace-nowrap">
                      <button
                        onClick={() =>
                          confirm(t.logoutAllConfirm(s.name)) &&
                          api(`/staff/${s.id}/logout-everywhere`, { method: 'POST', body: {} })
                            .then(() => alert(t.loggedOutAll(s.name)))
                            // Logging yourself out everywhere ends this session too.
                            .then(() => api('/me').catch(() => window.location.reload()))
                            .catch((err) => alert(err.message))
                        }
                        className="text-fog hover:text-ink text-sm font-bold mr-4"
                      >
                        {t.logoutAll}
                      </button>
                      <button
                        onClick={() =>
                          confirm(t.removeConfirm(s.name)) &&
                          api(`/staff/${s.id}`, { method: 'DELETE' })
                            .then(loadAll)
                            .catch((err) => alert(err.message))
                        }
                        className="text-fog hover:text-coral text-sm font-bold"
                      >
                        {t.remove}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}

        {tab === 'umbrellas' && (
          <>
            <div className="flex flex-wrap gap-2 items-end print:hidden">
              <form
                className="flex flex-wrap gap-2 items-end flex-1"
                onSubmit={async (e) => {
                  e.preventDefault()
                  if (!newUmbrella.number) return
                  await api('/umbrellas', { method: 'POST', body: newUmbrella }).catch((err) => alert(err.message))
                  setNewUmbrella({ number: '', zone: newUmbrella.zone })
                  loadAll()
                }}
              >
                <label className="w-36">
                  <span className="label">{t.numberPh}</span>
                  <input
                    className={inputCls}
                    placeholder="C1"
                    value={newUmbrella.number}
                    onChange={(e) => setNewUmbrella({ ...newUmbrella, number: e.target.value })}
                  />
                </label>
                <label className="w-48">
                  <span className="label">{t.zone}</span>
                  <input
                    className={inputCls}
                    value={newUmbrella.zone}
                    onChange={(e) => setNewUmbrella({ ...newUmbrella, zone: e.target.value })}
                  />
                </label>
                <button className="btn btn-primary">
                  {t.addUmbrella}
                </button>
              </form>
              <button
                onClick={() => window.print()}
                className="btn bg-ink text-white hover:bg-night-soft"
              >
                {t.printQr}
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {umbrellas.map((u) => (
                <UmbrellaCard key={u.id} umbrella={u} t={t} />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  )
}

export default function ManagerPage() {
  return (
    <StaffGate role="manager" title="Manager">
      {(name, logout) => <ManagerApp staffName={name} onLogout={logout} />}
    </StaffGate>
  )
}
