'use client'
import { useEffect, useState } from 'react'
import { api, euro } from '@/lib/api'
import { useLang, itemLabel, catLabel } from '@/lib/lang'
import PinPad from '@/components/PinPad'
import Icon from '@/components/Icon'

// Slam Beach Bar — one page: what's served, when it's open, where it is.
// The hero sets the bar's own sign in type (navy panel, white SLAM, yellow
// BEACH BAR); the four photos are the only images on the page.

const MAPS_URL = 'https://www.google.com/maps/place/Slam+Bar/@39.2659335,23.1667693,17z'
const MAPS_EMBED = 'https://maps.google.com/maps?q=39.2659335,23.1667693&z=15&output=embed'

// Opening hours (from the bar's Google listing), minutes after midnight.
// 0 = Sunday … 6 = Saturday. Wednesday runs to midnight.
const HOURS = { 0: [570, 1260], 1: [570, 1260], 2: [570, 1260], 3: [570, 1440], 4: [570, 1260], 5: [570, 1260], 6: [570, 1260] }
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

const PHOTOS = [
  { src: '/photos/aperitivo.jpg', en: 'Wine, spritz & meze', el: 'Κρασί, spritz & μεζέδες', alt: 'A glass of white wine and an Aperol spritz with small bowls of meze on a terrace table at dusk' },
  { src: '/photos/burrata.jpg', en: 'Burrata & tomatoes', el: 'Μπουράτα με ντοματίνια', alt: 'Burrata on cherry tomatoes and olives in a dark bowl, with bread on a blue and white Greek plate' },
  { src: '/photos/mojito.jpg', en: 'Mojitos in the shade', el: 'Mojito στη σκιά', alt: 'Two mojitos with lime, a bottle of water and a cup of fruit under an olive tree' },
  { src: '/photos/sundae.jpg', en: 'Ice cream by the sea', el: 'Παγωτό δίπλα στο κύμα', alt: 'An ice cream sundae with whipped cream, chocolate sauce and wafer rolls on a wooden beach table' },
]

const T = {
  en: {
    skip: 'Skip to content',
    place: 'Ampovos beach · Afissos, Pelion',
    openNow: (until) => `Open now · until ${until}`,
    closedNow: (opens) => `Closed · opens ${opens}`,
    directions: 'Directions',
    menu: 'Menu',
    hours: 'Hours',
    days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    today: 'today',
    findUs: 'Find us',
    address: 'Ampovos beach, Afissos 370 10, Pelion',
    openMaps: 'Open in Google Maps',
    sunbed: 'At your sunbed',
    sunbedText: 'Scan the QR code on your umbrella to see the menu and order. We bring it to you.',
    soldOut: 'sold out',
    menuLoading: 'Loading the menu…',
    staffLogin: 'Staff login',
    loginHint: 'Enter your PIN to open your screen.',
    loginBtn: 'Log in',
    loginBusy: 'Checking…',
    loginError: 'Wrong PIN — ask the manager for yours.',
    loginLocked: (s) => `Too many tries — try again in ${s}s.`,
    close: 'Close',
    langSwitch: 'Ελληνικά',
  },
  el: {
    skip: 'Μετάβαση στο περιεχόμενο',
    place: 'Παραλία Αμπωβός · Άφησσος, Πήλιο',
    openNow: (until) => `Ανοιχτά τώρα · έως ${until}`,
    closedNow: (opens) => `Κλειστά · ανοίγει ${opens}`,
    directions: 'Οδηγίες',
    menu: 'Μενού',
    hours: 'Ωράριο',
    days: ['Κυριακή', 'Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο'],
    today: 'σήμερα',
    findUs: 'Πού είμαστε',
    address: 'Παραλία Αμπωβός, Άφησσος 370 10, Πήλιο',
    openMaps: 'Άνοιγμα στο Google Maps',
    sunbed: 'Στην ξαπλώστρα σας',
    sunbedText: 'Σκανάρετε το QR στην ομπρέλα σας για να δείτε το μενού και να παραγγείλετε. Σας το φέρνουμε.',
    soldOut: 'εξαντλήθηκε',
    menuLoading: 'Φόρτωση μενού…',
    staffLogin: 'Είσοδος προσωπικού',
    loginHint: 'Βάλτε το PIN σας για να ανοίξει η οθόνη σας.',
    loginBtn: 'Σύνδεση',
    loginBusy: 'Έλεγχος…',
    loginError: 'Λάθος PIN — ρωτήστε τον διαχειριστή για το δικό σας.',
    loginLocked: (s) => `Πολλές προσπάθειες — δοκιμάστε ξανά σε ${s}″.`,
    close: 'Κλείσιμο',
    langSwitch: 'English',
  },
}

const ROLE_HOME = { manager: '/manager', waiter: '/waiter', bar: '/bar' }

const hhmm = (m) => (m >= 1440 ? '00:00' : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`)

// Day and minute in Greece, whatever the visitor's own time zone.
function athensNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Athens', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value])
  )
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday)
  return { day, minute: (Number(parts.hour) % 24) * 60 + Number(parts.minute) }
}

function openStatus() {
  const { day, minute } = athensNow()
  const [open, close] = HOURS[day]
  if (minute >= open && minute < close) return { open: true, at: hhmm(close), day }
  return { open: false, at: hhmm(minute < open ? open : HOURS[(day + 1) % 7][0]), day }
}

function StaffLoginSheet({ onClose, t }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const login = async (pin) => {
    let staff
    try {
      staff = await api('/login', { method: 'POST', body: { pin } })
    } catch (e) {
      if (e.status === 429) throw new Error(t.loginLocked(e.data?.retryAfter || 60))
      throw new Error(t.loginError)
    }
    localStorage.setItem('staff', JSON.stringify(staff))
    window.location.href = ROLE_HOME[staff.role] || '/'
  }
  return (
    <div className="fixed inset-0 z-[70] bg-night/60 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.staffLogin}
        onClick={(e) => e.stopPropagation()}
        className="rise-in bg-sand w-full sm:max-w-sm p-6 pb-8 sm:p-8 rounded-t-3xl sm:rounded-3xl shadow-[var(--shadow-pop)]"
      >
        <div className="flex justify-between items-center mb-2">
          <h2 className="font-display font-extrabold uppercase text-3xl tracking-wide">{t.staffLogin}</h2>
          <button type="button" onClick={onClose} aria-label={t.close} className="btn btn-quiet !min-h-0 w-11 h-11 !p-0 rounded-full">
            <Icon name="x" />
          </button>
        </div>
        <PinPad onSubmit={login} hint={t.loginHint} buttonLabel={t.loginBtn} busyLabel={t.loginBusy} />
      </div>
    </div>
  )
}

export default function Home() {
  const [lang, toggleLang] = useLang('guestLang', 'en')
  const t = T[lang]
  const [menu, setMenu] = useState(null)
  const [status, setStatus] = useState(null)
  const [loginOpen, setLoginOpen] = useState(false)

  useEffect(() => {
    api('/menu').then(setMenu).catch(() => setMenu([]))
    if (window.location.hash === '#staff') setLoginOpen(true)
    const tick = () => setStatus(openStatus())
    tick()
    const id = setInterval(tick, 60e3)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const categories = menu ? [...new Set(menu.map((m) => m.category))] : []

  return (
    <div className="bg-shell text-ink min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[80] btn btn-quiet">
        {t.skip}
      </a>

      {/* ---------- Hero: the sign, in type ---------- */}
      <header className="bg-night text-white">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <div className="flex items-center justify-end h-16">
            <button onClick={toggleLang} className="btn !min-h-10 !px-3.5 text-sm text-white border border-white/25 hover:bg-white/10" lang={lang === 'en' ? 'el' : 'en'}>
              <Icon name="globe" size={16} />
              {t.langSwitch}
            </button>
          </div>

          <div className="grid lg:grid-cols-[auto_1fr] gap-x-16 gap-y-7 lg:items-end pt-6 sm:pt-10 pb-12 lg:pb-16">
            <h1 className="w-full max-w-md lg:w-[36rem] lg:max-w-none">
              <img
                src="/photos/logo-wide.png"
                srcSet="/photos/logo-wide-600.png 600w, /photos/logo-wide.png 1200w"
                sizes="(min-width: 1024px) 576px, 90vw"
                width={1200}
                height={493}
                alt="Slam Beach Bar"
                className="block w-full h-auto"
              />
            </h1>

            <div className="lg:justify-self-end lg:text-right lg:pb-3">
              <p className="text-lg text-white/80">{t.place}</p>
              <div className="mt-5 min-h-9" aria-live="polite">
                {status && (
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-sm font-semibold">
                    <span className={`w-2.5 h-2.5 rounded-full ${status.open ? 'bg-palm-glow' : 'bg-white/50'}`} aria-hidden="true" />
                    {status.open ? t.openNow(status.at) : t.closedNow(status.at)}
                  </span>
                )}
              </div>
              <div className="mt-6 flex flex-wrap gap-3 lg:justify-end">
                <a href={MAPS_URL} target="_blank" rel="noopener" className="btn bg-slam text-night hover:brightness-95 text-base px-6 min-h-12">
                  <Icon name="navigate" size={18} />
                  {t.directions}
                </a>
                <a href="#menu" className="btn text-white border border-white/30 hover:bg-white/10 text-base px-6 min-h-12">
                  <Icon name="utensils" size={18} />
                  {t.menu}
                </a>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main id="main">
        {/* ---------- Hours · Find us · At your sunbed ---------- */}
        <section className="max-w-6xl mx-auto px-5 sm:px-8 py-14 grid md:grid-cols-3 gap-5">
          <div className="card p-6">
            <h2 className="eyebrow flex items-center gap-2 !text-ink">
              <Icon name="clock" size={18} className="text-sea" />
              {t.hours}
            </h2>
            <ul className="mt-4 space-y-1.5">
              {WEEK_ORDER.map((d) => {
                const isToday = status?.day === d
                return (
                  <li key={d} className={`flex justify-between gap-3 text-[0.9375rem] rounded-lg px-2 -mx-2 py-1 ${isToday ? 'bg-sea-tint font-semibold' : ''}`}>
                    <span>
                      {t.days[d]}
                      {isToday && <span className="sr-only"> ({t.today})</span>}
                    </span>
                    <span className="tnum">
                      {hhmm(HOURS[d][0])}–{hhmm(HOURS[d][1])}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>

          <div className="card p-6 flex flex-col">
            <h2 className="eyebrow flex items-center gap-2 !text-ink">
              <Icon name="pin" size={18} className="text-sea" />
              {t.findUs}
            </h2>
            <p className="mt-4 text-[0.9375rem]">{t.address}</p>
            <iframe
              src={MAPS_EMBED}
              title="Map: Slam Beach Bar, Ampovos beach, Afissos"
              className="mt-4 w-full h-44 rounded-xl border border-line flex-1 min-h-44"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
            <a href={MAPS_URL} target="_blank" rel="noopener" className="btn btn-quiet mt-4 w-full">
              <Icon name="navigate" size={18} />
              {t.openMaps}
            </a>
          </div>

          <div className="card p-6 bg-sea-tint border-sea/15">
            <h2 className="eyebrow flex items-center gap-2 !text-ink">
              <Icon name="qr" size={18} className="text-sea" />
              {t.sunbed}
            </h2>
            <p className="mt-4 text-[0.9375rem] leading-relaxed">{t.sunbedText}</p>
            <div className="mt-6 grid grid-cols-3 gap-2 text-sea" aria-hidden="true">
              <Icon name="qr" size={44} strokeWidth={1.6} />
              <Icon name="arrowRight" size={28} className="self-center justify-self-center text-fog" />
              <Icon name="umbrella" size={44} strokeWidth={1.6} />
            </div>
          </div>
        </section>

        {/* ---------- Menu ---------- */}
        <section id="menu" className="bg-sand border-t border-line scroll-mt-4">
          <div className="max-w-6xl mx-auto px-5 sm:px-8 py-14 sm:py-16">
            <h2 className="font-display font-black uppercase text-5xl sm:text-6xl leading-none">{t.menu}</h2>

            {/* The only photos on the page: what's served, where people choose */}
            <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {PHOTOS.map((p) => (
                <figure key={p.src} className="relative overflow-hidden rounded-2xl bg-line shadow-[var(--shadow-card)]">
                  <img src={p.src} alt={p.alt} width={414} height={414} loading="lazy" className="block aspect-square w-full object-cover" />
                  <figcaption className="absolute left-2 bottom-2 right-2">
                    <span className="inline-block rounded-full bg-white/92 text-night px-2.5 py-1 text-[0.75rem] sm:text-[0.8125rem] font-semibold leading-tight">
                      {p[lang]}
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>

            {!menu && <p className="mt-6 text-fog">{t.menuLoading}</p>}

            {categories.length > 0 && (
              <nav aria-label={t.menu} className="mt-6 flex flex-wrap gap-2">
                {categories.map((c) => (
                  <a key={c} href={`#cat-${c.replace(/\W+/g, '-')}`} className="btn btn-quiet !min-h-10 text-sm">
                    {catLabel(c, lang)}
                  </a>
                ))}
              </nav>
            )}

            <div className="mt-8 grid md:grid-cols-2 gap-5 items-start">
              {categories.map((c) => (
                <section key={c} id={`cat-${c.replace(/\W+/g, '-')}`} className="card p-6 scroll-mt-6">
                  <h3 className="font-display font-extrabold uppercase text-2xl tracking-wide">{catLabel(c, lang)}</h3>
                  <ul className="mt-3 divide-y divide-line">
                    {menu
                      .filter((m) => m.category === c)
                      .map((m) => (
                        <li key={m.id} className={`flex items-baseline gap-3 py-2.5 ${m.available ? '' : 'text-fog'}`}>
                          <span className="flex-1">
                            {itemLabel(m, lang)}
                            {!m.available && <span className="ml-2 text-xs font-semibold uppercase tracking-wide">· {t.soldOut}</span>}
                          </span>
                          <span className="tnum font-semibold">{euro(m.price)}</span>
                        </li>
                      ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-night text-white/75">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-8 flex flex-wrap items-center justify-between gap-4 text-sm">
          <span>
            <img src="/photos/logo-wide-600.png" alt="Slam Beach Bar" width={600} height={246} className="inline-block h-10 w-auto mr-3 align-middle" loading="lazy" />
            {t.place}
          </span>
          <button onClick={() => setLoginOpen(true)} className="btn !min-h-10 text-sm text-white border border-white/25 hover:bg-white/10">
            <Icon name="user" size={16} />
            {t.staffLogin}
          </button>
        </div>
      </footer>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': ['Restaurant', 'BarOrPub'],
            name: 'Slam Beach Bar',
            logo: '/photos/logo-wide.png',
            servesCuisine: 'Greek',
            image: PHOTOS.map((p) => p.src),
            address: {
              '@type': 'PostalAddress',
              streetAddress: 'Ampovos beach',
              addressLocality: 'Afissos',
              addressRegion: 'Thessaly',
              postalCode: '370 10',
              addressCountry: 'GR',
            },
            geo: { '@type': 'GeoCoordinates', latitude: 39.2659335, longitude: 23.1667693 },
            openingHoursSpecification: [
              { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], opens: '09:30', closes: '21:00' },
              { '@type': 'OpeningHoursSpecification', dayOfWeek: 'Wednesday', opens: '09:30', closes: '23:59' },
            ],
          }),
        }}
      />

      {loginOpen && <StaffLoginSheet onClose={() => setLoginOpen(false)} t={t} />}
    </div>
  )
}
