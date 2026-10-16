import { Geologica, Inter, Sofia_Sans_Extra_Condensed } from 'next/font/google'
import './globals.css'

// Both faces carry Greek, so EL and EN text never fall back mid-sentence.
// Display: tall condensed caps, after the "BEACH BAR" lettering on the sign.
const display = Sofia_Sans_Extra_Condensed({
  subsets: ['latin', 'greek'],
  weight: 'variable',
  variable: '--font-display-face',
  display: 'swap',
})
// Staff screens: a neutral working face, also with Greek.
const ui = Inter({
  subsets: ['latin', 'greek'],
  weight: 'variable',
  variable: '--font-ui-face',
  display: 'swap',
})
const body = Geologica({
  subsets: ['latin', 'greek'],
  weight: 'variable',
  variable: '--font-body-face',
  display: 'swap',
})

export const metadata = {
  title: 'Slam Beach Bar — Ampovos beach, Afissos, Pelion',
  description: 'Beach bar on Ampovos beach in Afissos, Pelion. Food and drinks served at your sunbed. Open every day from 9:30.',
  manifest: '/manifest.json',
  icons: { icon: '/icon.svg' },
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Slam' },
}

// No maximumScale: pinch-zoom stays available (accessibility).
// themeColor must be a literal (browsers read it before any CSS): --navy-950.
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0d1b36',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${ui.variable}`}>
      <body className="bg-sand text-ink font-sans antialiased">{children}</body>
    </html>
  )
}
