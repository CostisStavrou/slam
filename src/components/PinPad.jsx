'use client'
import { useEffect, useRef, useState } from 'react'
import Icon from '@/components/Icon'

// Big-thumb PIN pad for phones: no keyboard popup, huge keys, dots for
// progress, shake + red flash on a wrong PIN. PINs are 4–6 digits — the
// login button lights up at 4, a 6th digit submits by itself.
const MIN = 4
const MAX = 6

export default function PinPad({ onSubmit, label, hint, busyLabel, buttonLabel }) {
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [shaking, setShaking] = useState(false)
  const pinRef = useRef(pin)
  pinRef.current = pin

  const submit = async (value) => {
    if (busy || value.length < MIN) return
    setBusy(true)
    setError('')
    try {
      await onSubmit(value)
      // Success navigates away — keep the busy state until it does.
    } catch (err) {
      setError(err.message)
      setPin('')
      setShaking(true)
      setTimeout(() => setShaking(false), 450)
      if (navigator.vibrate) navigator.vibrate(200)
      setBusy(false)
    }
  }

  // Functional updates so lightning-fast taps never read a stale pin.
  const press = (digit) => {
    if (busy) return
    setError('')
    setPin((p) => (p + digit).slice(0, MAX))
  }
  const erase = () => {
    if (busy) return
    setError('')
    setPin((p) => p.slice(0, -1))
  }

  // A 6th digit submits by itself (PINs are 4–6 digits).
  useEffect(() => {
    if (pin.length === MAX) submit(pin)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin])

  // Physical keyboard still works (tablets, laptops).
  useEffect(() => {
    const onKey = (e) => {
      if (/^\d$/.test(e.key)) press(e.key)
      else if (e.key === 'Backspace') erase()
      else if (e.key === 'Enter') submit(pinRef.current)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy])

  const dots = Math.max(MIN, pin.length)
  const key =
    'h-14 sm:h-15 rounded-xl bg-sand text-ink text-2xl font-semibold tnum hover:bg-line active:bg-sea-tint active:scale-[0.97] transition disabled:opacity-40'

  return (
    <div className="w-full select-none">
      {label && <h2 className="text-xl font-bold text-center">{label}</h2>}
      {hint && <p className="text-sm text-fog text-center">{hint}</p>}

      {/* Progress dots */}
      <div
        className={`flex justify-center gap-3 mt-6 h-4 items-center ${shaking ? 'pin-shake' : ''}`}
        aria-label="PIN"
        role="status"
      >
        {Array.from({ length: dots }, (_, i) => (
          <span
            key={i}
            className={`w-3 h-3 rounded-full transition-colors duration-150 ${
              i < pin.length ? (error ? 'bg-coral' : 'bg-ink') : `border-[1.5px] ${error ? 'border-coral' : 'border-fog/50'}`
            }`}
          />
        ))}
      </div>
      <p
        className={`mt-3 min-h-5 flex items-center justify-center gap-1.5 text-center text-sm font-semibold ${error ? 'text-coral' : 'text-transparent'}`}
        aria-live="polite"
      >
        {error && <Icon name="alert" size={16} />}
        {error || '·'}
      </p>

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-2 mt-3">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
          <button key={d} type="button" onClick={() => press(String(d))} disabled={busy} className={key}>
            {d}
          </button>
        ))}
        <div aria-hidden="true" />
        <button type="button" onClick={() => press('0')} disabled={busy} className={key}>
          0
        </button>
        <button
          type="button"
          onClick={erase}
          disabled={busy || pin.length === 0}
          aria-label="Delete"
          className="h-14 sm:h-15 rounded-xl flex items-center justify-center text-fog hover:text-ink hover:bg-sand active:text-coral transition disabled:opacity-30"
        >
          <Icon name="backspace" size={24} />
        </button>
      </div>

      <button
        type="button"
        onClick={() => submit(pin)}
        disabled={busy || pin.length < MIN}
        className="btn w-full mt-5 min-h-13 text-base bg-night text-white hover:bg-night-soft disabled:!opacity-100 disabled:bg-sand disabled:text-fog/70"
      >
        {busy ? busyLabel : buttonLabel}
      </button>
    </div>
  )
}
