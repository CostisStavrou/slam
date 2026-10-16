'use client'
import { useEffect, useState } from 'react'

// One language hook for the whole app. Guests default to English
// (key "guestLang"), staff default to Greek (key "staffLang") — each
// device remembers its choice.
export function useLang(key, fallback) {
  const [lang, setLang] = useState(fallback)
  useEffect(() => {
    const saved = localStorage.getItem(key)
    if (saved === 'en' || saved === 'el') setLang(saved)
  }, [key])
  // The page's declared language drives Greek capitals: with lang="el" the
  // browser drops accents in uppercase text (ΣΕΡΒΙΤΟΡΟΣ, not ΣΕΡΒΙΤΌΡΟΣ).
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])
  const toggle = () => {
    setLang((prev) => {
      const next = prev === 'en' ? 'el' : 'en'
      localStorage.setItem(key, next)
      return next
    })
  }
  return [lang, toggle]
}

// Menu categories live in the database in English; display names map here.
export const CATEGORY_EL = {
  Cocktails: 'Κοκτέιλ',
  'Beer & Wine': 'Μπύρα & Κρασί',
  Coffee: 'Καφές',
  'Soft Drinks': 'Αναψυκτικά',
  Food: 'Φαγητό',
  'Snacks & Sweets': 'Σνακ & Γλυκά',
}
export const catLabel = (cat, lang) => (lang === 'el' && CATEGORY_EL[cat]) || cat
export const itemLabel = (item, lang) => (lang === 'el' && item?.name_el) || item?.name
