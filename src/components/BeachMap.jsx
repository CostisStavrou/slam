'use client'

// The beach as the waiter sees it: sea at the top, row A right on the water,
// a 5-wide block on the left, the walkway, then a 7-wide block on the right.
// Umbrella numbers like "B7" place themselves: row B, column 7 (1-5 left block,
// 6-12 right block). Anything that doesn't fit the pattern lists below the map.

const LEFT_COLS = [1, 2, 3, 4, 5]
const RIGHT_COLS = [6, 7, 8, 9, 10, 11, 12]

function parseSpot(number) {
  const m = /^([A-Za-z])(\d{1,2})$/.exec(number || '')
  if (!m) return null
  const col = parseInt(m[2], 10)
  if (col < 1 || col > 12) return null
  return { row: m[1].toUpperCase(), col }
}

const DEFAULT_LABELS = {
  sea: 'Sea',
  free: 'free',
  busy: 'has order',
  waving: 'waving',
  bill: 'wants the bill',
  reserved: 'reserved',
  other: 'Other spots',
}

export default function BeachMap({
  umbrellas,
  busy,
  waving = new Set(),
  bills = new Set(),
  reserved = new Set(),
  busyLabel,
  labels: labelsProp,
  showAlerts = true,
  onSelect,
  // 'lg' is the manager's desktop view: a wider beach with bigger spots.
  size = 'md',
  className = '',
}) {
  const lg = size === 'lg'
  const labels = { ...DEFAULT_LABELS, ...(labelsProp || {}) }
  if (busyLabel) labels.busy = busyLabel
  const grid = new Map()
  const rowSet = new Set()
  const extras = []
  for (const u of umbrellas) {
    const p = parseSpot(u.number)
    if (p) {
      grid.set(`${p.row}-${p.col}`, u)
      rowSet.add(p.row)
    } else {
      extras.push(u)
    }
  }
  const rows = [...rowSet].sort()

  const spot = (row, col) => {
    const u = grid.get(`${row}-${col}`)
    if (!u) return <span key={col} className="aspect-square w-full" aria-hidden="true" />
    const wantsBill = bills.has(u.id)
    const isReserved = reserved.has(u.id)
    const state = waving.has(u.id) ? 'waving' : busy.has(u.id) ? 'busy' : 'free'
    const cls =
      state === 'waving'
        ? 'bg-sun-bright border-sun-bright text-shell'
        : state === 'busy'
        ? lg
          ? 'bg-action border-action text-white'
          : 'bg-sea border-sea text-shell'
        : isReserved
        ? lg
          ? 'bg-night border-night text-white'
          : 'bg-shell border-dashed border-ink text-ink'
        : 'bg-shell border-line text-ink hover:border-sea'
    const label = [
      state === 'waving' && labels.waving,
      state === 'busy' && labels.busy,
      wantsBill && labels.bill,
      isReserved && labels.reserved,
    ]
      .filter(Boolean)
      .join(', ')
    return (
      <button
        key={col}
        onClick={() => onSelect(u)}
        aria-label={`Umbrella ${u.number}${label ? `, ${label}` : ''}`}
        className={`relative aspect-square w-full rounded-full ${lg ? 'border-[1.5px] text-[11px] sm:text-sm font-semibold' : 'border-2 text-[11px] font-extrabold'} tnum transition-colors ${cls}`}
      >
        {col}
        {wantsBill && (
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-palm border-2 border-shell"
          />
        )}
        {isReserved && !lg && (
          <span
            aria-hidden="true"
            className="absolute -bottom-1 -left-1 w-3 h-3 rounded-full bg-ink border-2 border-shell"
          />
        )}
      </button>
    )
  }

  // One shared grid: row label · 5 columns · walkway · 7 columns.
  // Everything (sea included) aligns to the same tracks at any width.
  const rowGrid = `grid grid-cols-[0.9rem_repeat(5,1fr)_0.5fr_repeat(7,1fr)] ${lg ? 'gap-1 sm:gap-2' : 'gap-1'} items-center`

  return (
    <div className={`space-y-3 mx-auto ${lg ? 'max-w-3xl' : 'max-w-md'} ${className}`}>
      <div className={`bg-shell rounded-2xl border border-line space-y-2 ${lg ? 'p-3 sm:p-5 shadow-[var(--shadow-card)]' : 'p-3'}`}>
        {/* The sea — aligned over the umbrella columns */}
        <div className={rowGrid}>
          <div className={`relative rounded-xl overflow-hidden bg-gradient-to-b from-night to-night-soft col-[2/-1] mb-1 ${lg ? 'h-28 sm:h-36 lg:h-[clamp(5rem,15vh,10rem)]' : 'h-20 sm:h-14'}`}>
            <svg className={`absolute inset-x-0 bottom-0 w-full ${lg ? 'h-10 sm:h-14' : ''}`} viewBox="0 0 400 24" preserveAspectRatio="none" aria-hidden="true">
              <path d="M0 12 Q25 4 50 12 T100 12 T150 12 T200 12 T250 12 T300 12 T350 12 T400 12 V24 H0 Z" fill="rgba(255,255,255,0.35)" />
              <path d="M0 18 Q25 11 50 18 T100 18 T150 18 T200 18 T250 18 T300 18 T350 18 T400 18 V24 H0 Z" fill="rgba(255,255,255,0.55)" />
            </svg>
            <span className={`absolute inset-0 flex items-center justify-center text-shell uppercase ${lg ? 'text-xs sm:text-sm font-medium tracking-[0.4em] pb-4' : 'text-[11px] font-extrabold tracking-[0.35em]'}`}>
              {labels.sea}
            </span>
          </div>
        </div>

        {/* Umbrella rows — A touches the water; the empty track is the walkway */}
        {rows.map((row) => (
          <div key={row} className={rowGrid}>
            <span className={`text-xs text-fog ${lg ? 'font-medium' : 'font-extrabold'}`}>{row}</span>
            {LEFT_COLS.map((c) => spot(row, c))}
            <span aria-hidden="true" />
            {RIGHT_COLS.map((c) => spot(row, c))}
          </div>
        ))}

        {/* Legend */}
        <div className={`flex justify-center flex-wrap gap-x-4 gap-y-1 pt-1.5 text-fog ${lg ? 'text-xs pt-3' : 'text-[11px] font-bold'}`}>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full border-2 border-line bg-shell" /> {labels.free}
          </span>
          <span className="flex items-center gap-1.5">
            <span className={`w-3 h-3 rounded-full ${lg ? 'bg-action' : 'bg-sea'}`} /> {labels.busy}
          </span>
          {showAlerts && (
            <>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-sun-bright" /> {labels.waving}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-palm" /> {labels.bill}
              </span>
            </>
          )}
          {reserved.size > 0 && (
            <span className="flex items-center gap-1.5">
              <span className={`w-3 h-3 rounded-full ${lg ? 'bg-night' : 'border-2 border-dashed border-ink bg-shell'}`} /> {labels.reserved}
            </span>
          )}
        </div>
      </div>

      {extras.length > 0 && (
        <div>
          <h3 className="text-xs font-extrabold text-fog uppercase tracking-widest px-1 mb-2">{labels.other}</h3>
          <div className="flex flex-wrap gap-2">
            {extras.map((u) => (
              <button
                key={u.id}
                onClick={() => onSelect(u)}
                className="bg-shell border border-line hover:border-sea rounded-full px-3.5 py-1.5 text-sm font-extrabold transition-colors"
              >
                {u.number}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
