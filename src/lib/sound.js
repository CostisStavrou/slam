'use client'

let ctx

// Simple attention beep — no audio assets needed, works offline.
export function beep(times = 1) {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
    for (let i = 0; i < times; i++) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = 880
      const t = ctx.currentTime + i * 0.25
      gain.gain.setValueAtTime(0.4, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2)
      osc.start(t)
      osc.stop(t + 0.2)
    }
  } catch {
    // Audio not allowed yet (no user gesture) — silently skip.
  }
  if (navigator.vibrate) navigator.vibrate([200, 100, 200])
}
