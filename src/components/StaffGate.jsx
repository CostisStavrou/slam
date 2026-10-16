'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useLang } from '@/lib/lang'
import PinPad from '@/components/PinPad'
import Icon from '@/components/Icon'

const T = {
  el: {
    titles: { Waiter: 'Σερβιτόρος', 'Bar & kitchen': 'Μπαρ & κουζίνα', Manager: 'Διαχείριση' },
    roles: { waiter: 'σερβιτόρος', bar: 'μπαρ/κουζίνα', manager: 'διαχειριστής' },
    signIn: 'Είσοδος προσωπικού',
    pinHint: 'Βάλε το PIN σου για να συνεχίσεις.',
    loginBtn: 'Σύνδεση',
    loginBusy: 'Έλεγχος…',
    wrongPin: 'Λάθος PIN — ρώτα τον διαχειριστή για το δικό σου.',
    locked: (s) => `Πολλές προσπάθειες — δοκίμασε ξανά σε ${s}″.`,
    wrongRole: (name, role, needed) => `Είσαι συνδεδεμένος ως ${name} (${role}), αλλά αυτή η οθόνη θέλει ρόλο «${needed}».`,
    goMyScreen: 'Πήγαινε στη δική μου οθόνη',
    logout: 'Αποσύνδεση',
    home: 'Αρχική',
  },
  en: {
    titles: { Waiter: 'Waiter', 'Bar & kitchen': 'Bar & kitchen', Manager: 'Manager' },
    roles: { waiter: 'waiter', bar: 'bar/kitchen', manager: 'manager' },
    signIn: 'Staff sign-in',
    pinHint: 'Enter your PIN to continue.',
    loginBtn: 'Log in',
    loginBusy: 'Checking…',
    wrongPin: 'Wrong PIN — ask the manager for yours.',
    locked: (s) => `Too many tries — try again in ${s}s.`,
    wrongRole: (name, role, needed) => `You're logged in as ${name} (${role}), but this screen needs the ${needed} role.`,
    goMyScreen: 'Go to my screen',
    logout: 'Log out',
    home: 'Home',
  },
}

const ROLE_HOME = { manager: '/manager', waiter: '/waiter', bar: '/bar' }

// Staff screens gate themselves: the server is the source of truth (/api/me on
// mount). Not logged in? The PIN pad is right here — no detour through the
// website. Logged in with another role? One tap to your own screen.
export default function StaffGate({ role, title, children }) {
  const [lang, toggleLang] = useLang('staffLang', 'el')
  const t = T[lang]
  const [staff, setStaff] = useState(undefined)

  useEffect(() => {
    api('/me')
      .then((s) => {
        localStorage.setItem('staff', JSON.stringify(s))
        setStaff(s)
      })
      .catch(() => {
        localStorage.removeItem('staff')
        setStaff(null)
      })
  }, [])

  if (staff === undefined) return null

  const login = async (pin) => {
    let s
    try {
      s = await api('/login', { method: 'POST', body: { pin } })
    } catch (e) {
      if (e.status === 429) throw new Error(t.locked(e.data?.retryAfter || 60))
      throw new Error(t.wrongPin)
    }
    localStorage.setItem('staff', JSON.stringify(s))
    if (s.role === role || s.role === 'manager') setStaff(s)
    else window.location.href = ROLE_HOME[s.role] || '/'
  }

  const logout = () => {
    api('/logout', { method: 'POST', body: {} })
      .catch(() => {})
      .finally(() => {
        localStorage.removeItem('staff')
        setStaff(null)
      })
  }

  const allowed = staff && (staff.role === role || staff.role === 'manager')
  if (!allowed) {
    return (
      <div className="min-h-dvh bg-night text-white flex flex-col font-ui">
        <header className="w-full max-w-md mx-auto px-4 pt-3 flex items-center justify-between">
          <a href="/" className="btn !min-h-10 !px-2.5 text-sm font-semibold text-white/85 hover:text-white hover:bg-white/10">
            <Icon name="arrowLeft" size={18} />
            {t.home}
          </a>
          <button
            onClick={toggleLang}
            className="btn !min-h-10 !px-3 text-sm font-semibold text-white/85 hover:text-white hover:bg-white/10"
            aria-label={lang === 'el' ? 'English' : 'Ελληνικά'}
          >
            <Icon name="globe" size={16} />
            {lang === 'el' ? 'EN' : 'ΕΛ'}
          </button>
        </header>

        <main className="flex-1 w-full max-w-md mx-auto px-4 pt-4 pb-8 sm:pt-10 flex flex-col">
          <img src="/photos/logo-wide-600.png" alt="Slam Beach Bar" width={600} height={246} className="mx-auto block w-52 sm:w-60 h-auto" />

          <div className="mt-6 sm:mt-8 bg-shell text-ink rounded-3xl shadow-[var(--shadow-pop)] px-5 py-6 sm:px-8 sm:py-8">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-fog">{t.signIn}</p>
              <h1 className="mt-1.5 text-2xl font-bold tracking-tight">{t.titles[title] || title}</h1>
            </div>
            <div className="mt-2">
              {!staff ? (
                <PinPad onSubmit={login} hint={t.pinHint} buttonLabel={t.loginBtn} busyLabel={t.loginBusy} />
              ) : (
                <div className="space-y-3 text-center pt-2">
                  <p className="text-sm text-fog">
                    {t.wrongRole(staff.name, t.roles[staff.role] || staff.role, t.roles[role] || role)}
                  </p>
                  <a href={ROLE_HOME[staff.role] || '/'} className="btn w-full min-h-13 bg-night text-white hover:bg-night-soft">
                    {t.goMyScreen}
                  </a>
                  <button onClick={logout} className="btn btn-quiet w-full text-coral">
                    {t.logout}
                  </button>
                </div>
              )}
            </div>
          </div>

          <p className="mt-auto pt-8 text-center text-xs text-white/60">Slam Beach Bar · Ampovos, Afissos</p>
        </main>
      </div>
    )
  }

  const fullLogout = () => {
    api('/logout', { method: 'POST', body: {} })
      .catch(() => {})
      .finally(() => {
        localStorage.removeItem('staff')
        window.location.href = '/'
      })
  }

  return <div className="font-ui">{children(staff.name, fullLogout, staff)}</div>
}
