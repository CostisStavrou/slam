'use client'

// The signature element: every screen shows *where* as a round buoy-ring tag.
// Same shape, same weight, everywhere — staff eyes land on the spot first.
const SIZES = {
  sm: 'w-9 h-9 text-base ring-offset-1',
  md: 'w-12 h-12 text-xl ring-offset-2',
  lg: 'w-16 h-16 text-[1.75rem] ring-offset-2',
}

const TONES = {
  sea: 'ring-sea',
  sun: 'ring-sun-bright',
  palm: 'ring-palm',
  ink: 'ring-ink',
  action: 'ring-action',
}

export default function SpotTag({ number, size = 'md', tone = 'sea' }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-shell font-display font-extrabold leading-none text-ink ring-2 ring-offset-sand shrink-0 tnum ${SIZES[size]} ${TONES[tone]}`}
      aria-label={`Umbrella ${number}`}
    >
      {number}
    </span>
  )
}
