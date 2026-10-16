'use client'
import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { useLang } from '@/lib/lang'
import SpotTag from '@/components/SpotTag'
import BeachMap from '@/components/BeachMap'
import Icon from '@/components/Icon'

const T = {
  el: {
    title: 'Κρατήσεις',
    today: 'Σήμερα',
    todayTitle: 'Κρατήσεις σήμερα',
    free: (f, t) => `${f} από ${t} ελεύθερες`,
    none: 'Καμία κράτηση για αυτή τη μέρα.',
    arrivedN: (n) => `${n} ήρθαν`,
    people: (n) => (n === 1 ? '1 άτομο' : `${n} άτομα`),
    at: 'άφιξη',
    code: 'κωδ.',
    source: { phone: 'Τηλεφωνητής', 'voice-test': 'Δοκιμή', staff: 'Προσωπικό' },
    arrived: 'Ήρθε',
    markArrived: 'Ήρθαν',
    undo: 'Αναίρεση',
    cancel: 'Ακύρωση',
    cancelConfirm: (name, code) => `Ακύρωση της κράτησης «${name}» (${code});`,
    cancelled: 'Ακυρώθηκε',
    newTitle: 'Νέα κράτηση',
    dayList: 'Κρατήσεις της ημέρας',
    listBtn: 'Κρατήσεις',
    freeLabel: 'ελεύθερες ομπρέλες',
    bookingsLabel: 'κρατήσεις',
    arrivedLabel: 'ήρθαν',
    bookPicked: (n) => (n === 1 ? 'Κράτηση 1 ομπρέλας' : `Κράτηση ${n} ομπρελών`),
    mapHint: 'Πάτησε ελεύθερες ομπρέλες για να τις διαλέξεις, ή μια κρατημένη για να δεις ποιος την έχει.',
    prevDay: 'Προηγούμενη μέρα',
    nextDay: 'Επόμενη μέρα',
    name: 'Όνομα',
    phone: 'Τηλέφωνο',
    party: 'Άτομα',
    umbrellas: 'Ομπρέλες',
    arrival: 'Ώρα άφιξης',
    notes: 'Σημειώσεις',
    picked: 'Επιλεγμένες',
    pickHint: 'Πάτησε ελεύθερες ομπρέλες για να τις διαλέξεις πριν τη «Νέα κράτηση» — ή άφησέ το και θα δοθούν αυτόματα. Πάτησε μια κρατημένη για να δεις ποιος την έχει.',
    newBtn: 'Νέα κράτηση',
    newSub: 'Διάλεξε πρώτα ομπρέλες στον χάρτη — ή άφησέ το αυτόματο',
    withPicked: (p) => `για τις ομπρέλες ${p.join(', ')}`,
    close: 'Κλείσιμο',
    clear: 'Καθαρισμός',
    add: 'Κράτηση',
    added: (code) => `Έγινε η κράτηση — κωδικός ${code}`,
    map: { sea: 'Θάλασσα', free: 'ελεύθερη', busy: 'επιλεγμένη', reserved: 'κρατημένη', other: 'Άλλες θέσεις' },
  },
  en: {
    title: 'Bookings',
    today: 'Today',
    todayTitle: 'Bookings today',
    free: (f, t) => `${f} of ${t} free`,
    none: 'No bookings for this day.',
    arrivedN: (n) => `${n} arrived`,
    people: (n) => (n === 1 ? '1 person' : `${n} people`),
    at: 'arriving',
    code: 'code',
    source: { phone: 'Phone agent', 'voice-test': 'Test', staff: 'Staff' },
    arrived: 'Arrived',
    markArrived: 'Arrived',
    undo: 'Undo',
    cancel: 'Cancel',
    cancelConfirm: (name, code) => `Cancel the booking for "${name}" (${code})?`,
    cancelled: 'Cancelled',
    newTitle: 'New booking',
    dayList: "This day's bookings",
    listBtn: 'Bookings',
    freeLabel: 'umbrellas free',
    bookingsLabel: 'bookings',
    arrivedLabel: 'arrived',
    bookPicked: (n) => (n === 1 ? 'Book 1 umbrella' : `Book ${n} umbrellas`),
    mapHint: 'Tap free umbrellas to pick them, or a reserved one to see who has it.',
    prevDay: 'Previous day',
    nextDay: 'Next day',
    name: 'Name',
    phone: 'Phone',
    party: 'People',
    umbrellas: 'Umbrellas',
    arrival: 'Arrival time',
    notes: 'Notes',
    picked: 'Picked',
    pickHint: 'Tap free umbrellas to choose them before “New booking” — or leave it and they are assigned automatically. Tap a reserved one to see who has it.',
    newBtn: 'New booking',
    newSub: 'Pick umbrellas on the map first — or let it choose',
    withPicked: (p) => `for umbrellas ${p.join(', ')}`,
    close: 'Close',
    clear: 'Clear',
    add: 'Book',
    added: (code) => `Booked — code ${code}`,
    map: { sea: 'Sea', free: 'free', busy: 'picked', reserved: 'reserved', other: 'Other spots' },
  },
}

function shiftDate(date, n) {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function prettyDate(date, lang) {
  return new Intl.DateTimeFormat(lang === 'el' ? 'el-GR' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`))
}

function BookingCard({ b, t, onAction, compact }) {
  const cancelled = b.status === 'cancelled'
  const arrived = b.status === 'arrived'
  return (
    <div
      className={`rounded-xl border p-4 space-y-3 ${
        cancelled ? 'bg-shell border-line opacity-50' : arrived ? 'bg-palm-tint border-palm' : 'bg-shell border-line'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex -space-x-2 shrink-0">
          {(b.umbrellas.length ? b.umbrellas : ['—']).slice(0, 3).map((n) => (
            <SpotTag key={n} number={n} size="sm" tone={arrived ? 'palm' : 'ink'} />
          ))}
          {b.umbrellas.length > 3 && <span className="text-xs font-bold text-fog self-center pl-3">+{b.umbrellas.length - 3}</span>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[15px] truncate">{b.name}</div>
          <div className="text-[13px] text-fog">
            {t.people(b.party_size)}
            {b.arrival_time && ` · ${t.at} ${b.arrival_time}`}
            {b.phone && (
              <>
                {' · '}
                <a href={`tel:${b.phone}`} className="underline underline-offset-2 tnum">
                  {b.phone}
                </a>
              </>
            )}
          </div>
          {b.notes && <div className="text-[13px] text-sun font-medium mt-1">{b.notes}</div>}
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs text-fog tnum">
            {t.code} {b.code}
          </div>
          <div className="text-xs text-fog mt-0.5 flex items-center justify-end gap-1">
            <Icon name={b.source === 'phone' ? 'phone' : b.source === 'voice-test' ? 'flask' : 'user'} size={12} />
            {t.source[b.source] || b.source}
          </div>
        </div>
      </div>
      {cancelled ? (
        <div className="text-xs font-medium text-coral">{t.cancelled}</div>
      ) : (
        <div className="flex gap-2">
          {arrived ? (
            <button onClick={() => onAction(b, 'not_arrived')} className="btn !min-h-10 flex-1 text-sm font-medium text-palm-deep border border-palm bg-shell">
              <Icon name="check" size={18} />
              {t.arrived} · {t.undo}
            </button>
          ) : (
            <button onClick={() => onAction(b, 'arrived')} className="btn !min-h-10 flex-1 text-sm font-medium bg-palm text-white hover:bg-palm-deep">
              {t.markArrived}
            </button>
          )}
          {!compact && (
            <button
              onClick={() => confirm(t.cancelConfirm(b.name, b.code)) && onAction(b, 'cancel')}
              className="btn !min-h-10 px-4 text-sm font-medium text-fog bg-shell border border-line hover:text-coral hover:border-coral"
            >
              {t.cancel}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// A pop-up window: centered on desktop, a bottom sheet on a phone. Esc,
// the × or a click outside closes it.
function Modal({ title, onClose, closeLabel, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const before = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = before
    }
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 bg-night/50 flex items-end sm:items-center justify-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="bg-shell w-full sm:max-w-2xl max-h-[90vh] flex flex-col rounded-t-2xl sm:rounded-2xl shadow-[var(--shadow-pop)]"
      >
        <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-line">
          <h3 className="text-base font-semibold first-letter:uppercase">{title}</h3>
          <button onClick={onClose} aria-label={closeLabel} className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-fog hover:bg-sand hover:text-ink">
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="overflow-y-auto p-5 sm:p-6">{children}</div>
      </div>
    </div>
  )
}

// Full view (manager): pick a day, see the beach, add/cancel/check in.
// Compact view (waiter, today only): a collapsible list for checking guests in;
// `onReserved` hands the reserved umbrella ids up to the waiter's own map.
export default function BookingsPanel({ compact = false, umbrellas = [], onReserved }) {
  const [lang] = useLang('staffLang', 'el')
  const t = T[lang]
  const [date, setDate] = useState(null)
  const [data, setData] = useState(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', partySize: 2, umbrellas: '', arrivalTime: '', notes: '' })
  const [picked, setPicked] = useState([])
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const [focusId, setFocusId] = useState(null)
  const closeForm = useCallback(() => setFormOpen(false), [])
  const closeList = useCallback(() => setListOpen(false), [])

  const load = useCallback(() => {
    api(`/bookings${date ? `?date=${date}` : ''}`)
      .then((d) => {
        setData(d)
        if (!date) setDate(d.date)
        if (onReserved && d.date === d.today) {
          onReserved(new Set(d.bookings.filter((b) => b.status !== 'cancelled').flatMap((b) => b.umbrella_ids)))
        }
      })
      .catch(() => {})
  }, [date, onReserved])

  useEffect(() => {
    load()
    const socket = getSocket()
    const onChanged = ({ type }) => type === 'bookings' && load()
    socket.on('changed', onChanged)
    return () => socket.off('changed', onChanged)
  }, [load])

  useEffect(() => setPicked([]), [date])

  const act = async (b, action) => {
    try {
      await api(`/bookings/${b.id}`, { method: 'PATCH', body: { action } })
      load()
    } catch (e) {
      alert(e.message)
    }
  }

  const add = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setBusy(true)
    try {
      const b = await api('/bookings', {
        method: 'POST',
        body: {
          date,
          name: form.name,
          phone: form.phone,
          partySize: Number(form.partySize) || 1,
          umbrellas: form.umbrellas ? Number(form.umbrellas) : undefined,
          umbrellaNumbers: picked.length ? picked : null,
          arrivalTime: form.arrivalTime,
          notes: form.notes,
        },
      })
      setMsg(t.added(b.code))
      setTimeout(() => setMsg(''), 6000)
      setForm({ name: '', phone: '', partySize: 2, umbrellas: '', arrivalTime: '', notes: '' })
      setPicked([])
      setFormOpen(false)
      load()
    } catch (err) {
      alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (!data) return null
  const active = data.bookings.filter((b) => b.status !== 'cancelled')
  const arrivedCount = active.filter((b) => b.status === 'arrived').length

  if (compact) {
    if (active.length === 0) return null
    return (
      <div className="bg-shell rounded-2xl border border-line overflow-hidden">
        <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 text-left">
          <span className="font-extrabold text-[15px]">
            <Icon name="calendar" size={20} className="inline -mt-1 mr-1.5 text-sea" />
            {t.todayTitle} <span className="ml-1 bg-ink text-shell rounded-full px-2 py-0.5 text-xs tnum">{active.length}</span>
          </span>
          <span className="text-xs font-bold text-fog">
            {t.arrivedN(arrivedCount)} {open ? '▴' : '▾'}
          </span>
        </button>
        {open && (
          <div className="p-3 pt-0 space-y-2">
            {active.map((b) => (
              <BookingCard key={b.id} b={b} t={t} onAction={act} compact />
            ))}
          </div>
        )}
      </div>
    )
  }

  const reservedIds = new Set(active.flatMap((b) => b.umbrella_ids))
  const bookingOf = new Map(active.flatMap((b) => b.umbrella_ids.map((id) => [id, b.id])))
  const pickedIds = new Set(umbrellas.filter((u) => picked.includes(u.number)).map((u) => u.id))
  const inputCls = 'field'
  const dayName = prettyDate(data.date, lang)
  const isToday = data.date === data.today

  const field = (label, input, span = '') => (
    <label className={`block min-w-0 ${span}`}>
      <span className="block text-sm font-medium text-ink mb-1.5">{label}</span>
      {input}
    </label>
  )
  const navBtn = 'w-9 h-9 flex items-center justify-center text-fog hover:text-ink hover:bg-sand transition-colors'
  const stat = (value, label) => (
    <div className="flex items-baseline gap-1.5">
      <span className="text-lg font-semibold tnum">{value}</span>
      <span className="text-sm text-fog">{label}</span>
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Toolbar: the day on the left, moving between days and actions on the right */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-0 mr-auto">
          <h2 className="text-xl font-semibold tracking-tight first-letter:uppercase">{dayName}</h2>
          <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
            {stat(`${data.availability.free}/${data.availability.total}`, t.freeLabel)}
            {stat(active.length, t.bookingsLabel)}
            {stat(arrivedCount, t.arrivedLabel)}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg border border-line bg-shell overflow-hidden divide-x divide-line">
            <button onClick={() => setDate(shiftDate(date, -1))} className={navBtn} aria-label={t.prevDay} title={t.prevDay}>
              <Icon name="arrowLeft" size={16} />
            </button>
            <button
              onClick={() => setDate(data.today)}
              disabled={isToday}
              className="h-9 px-3 text-sm font-medium text-ink hover:bg-sand disabled:text-fog disabled:hover:bg-transparent transition-colors"
            >
              {t.today}
            </button>
            <button onClick={() => setDate(shiftDate(date, 1))} className={navBtn} aria-label={t.nextDay} title={t.nextDay}>
              <Icon name="arrowRight" size={16} />
            </button>
          </div>
          <input
            type="date"
            value={date || ''}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="h-9 rounded-lg border border-line bg-shell px-2.5 text-sm text-ink"
            aria-label="Date"
          />
          <button
            onClick={() => {
              setFocusId(null)
              setListOpen(true)
            }}
            className="btn btn-quiet !min-h-9 px-3 text-sm font-medium"
          >
            <Icon name="list" size={16} />
            {t.listBtn}
            <span className="min-w-5 h-5 px-1.5 rounded-full bg-sand text-xs leading-5 text-center tnum">{active.length}</span>
          </button>
          <button onClick={() => setFormOpen(true)} className="btn btn-primary !min-h-9 px-3.5 text-sm font-medium">
            <Icon name="plus" size={16} />
            {t.newBtn}
          </button>
        </div>
      </div>

      {msg && (
        <div role="status" className="rise-in flex items-center gap-2 rounded-lg bg-palm-tint text-palm-deep px-4 py-2.5 text-sm font-medium">
          <Icon name="check" size={18} />
          {msg}
        </div>
      )}

      <BeachMap
        size="lg"
        className="lg:max-w-[max(28rem,min(56rem,calc(354vh_-_1200px)))]"
        umbrellas={umbrellas}
        busy={pickedIds}
        reserved={reservedIds}
        labels={t.map}
        showAlerts={false}
        onSelect={(u) => {
          if (reservedIds.has(u.id)) {
            setFocusId(bookingOf.get(u.id) ?? null)
            setListOpen(true)
            return
          }
          setPicked((p) => (p.includes(u.number) ? p.filter((n) => n !== u.number) : [...p, u.number]))
        }}
      />

      {/* Picked umbrellas: book them, or a quiet hint when nothing is picked */}
      {picked.length > 0 ? (
        <div className="rise-in flex flex-wrap items-center gap-3 rounded-xl border border-action/30 bg-sand px-4 py-3">
          <div className="flex flex-wrap items-center gap-1.5 mr-auto">
            <span className="text-sm font-medium text-action mr-1">{t.picked}</span>
            {picked.map((n) => (
              <SpotTag key={n} number={n} size="sm" tone="action" />
            ))}
          </div>
          <button onClick={() => setPicked([])} className="btn !min-h-9 px-3 text-sm font-medium text-action hover:bg-shell">
            {t.clear}
          </button>
          <button onClick={() => setFormOpen(true)} className="btn btn-primary !min-h-9 px-3.5 text-sm font-medium">
            {t.bookPicked(picked.length)}
          </button>
        </div>
      ) : (
        <p className="text-center text-sm text-fog">{t.mapHint}</p>
      )}

      {formOpen && (
        <Modal title={`${t.newTitle} · ${dayName}`} onClose={closeForm} closeLabel={t.close}>
          <form onSubmit={add} className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
              {field(t.name, <input autoFocus className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />, 'col-span-2 sm:col-span-3')}
              {field(t.phone, <input className={inputCls} inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />, 'col-span-2 sm:col-span-3')}
              {field(t.party, <input className={`${inputCls} tnum`} type="number" min="1" max="60" value={form.partySize} onChange={(e) => setForm({ ...form, partySize: e.target.value })} />, 'sm:col-span-2')}
              {field(t.arrival, <input className={inputCls} placeholder="11:00" value={form.arrivalTime} onChange={(e) => setForm({ ...form, arrivalTime: e.target.value })} />, 'sm:col-span-2')}
              {picked.length === 0
                ? field(
                    t.umbrellas,
                    <input className={`${inputCls} tnum`} type="number" min="1" max="12" placeholder="auto" value={form.umbrellas} onChange={(e) => setForm({ ...form, umbrellas: e.target.value })} />,
                    'col-span-2 sm:col-span-2'
                  )
                : field(
                    t.picked,
                    <div className="flex items-center gap-1.5 flex-wrap min-h-11">
                      {picked.map((n) => (
                        <SpotTag key={n} number={n} size="sm" tone="action" />
                      ))}
                      <button type="button" onClick={() => setPicked([])} className="text-sm text-fog hover:text-ink underline underline-offset-2 ml-1">
                        {t.clear}
                      </button>
                    </div>,
                    'col-span-2 sm:col-span-2'
                  )}
              {field(t.notes, <input className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />, 'col-span-2 sm:col-span-6')}
            </div>
            <button disabled={busy || !form.name.trim()} className="btn btn-primary w-full font-medium disabled:opacity-40">
              {t.add}
            </button>
          </form>
        </Modal>
      )}

      {listOpen && (
        <Modal title={`${t.dayList} · ${dayName}`} onClose={closeList} closeLabel={t.close}>
          {data.bookings.length === 0 ? (
            <div className="text-center text-sm text-fog py-10 border border-dashed border-line rounded-xl">{t.none}</div>
          ) : (
            <div className="space-y-3">
              {data.bookings.map((b) => (
                <div
                  key={b.id}
                  ref={(el) => el && b.id === focusId && el.scrollIntoView({ block: 'center' })}
                  className={b.id === focusId ? 'rounded-xl ring-2 ring-sea ring-offset-2 ring-offset-shell' : ''}
                >
                  <BookingCard b={b} t={t} onAction={act} />
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
