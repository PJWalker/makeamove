import { signal, type Signal } from '@preact/signals'
import { useEffect, useRef, useState } from 'preact/hooks'
import { BACKDROP_ICONS } from './backdropIcons'

const SIZE_RANGE = [20, 42] // icon size in px, random within this range
const GAP = 16 // minimum clear space between icons, in px
const TILT = 18 // maximum rotation either way, in degrees
const TRIES = 24 // candidates tried around each icon before giving up on it
const SWAP_EVERY = [700, 1600] // ms, random within this range

interface Cell {
  x: number
  y: number
  size: number
  rotate: number
  icon: Signal<number>
}

const between = ([min, max]: number[]) => min + Math.random() * (max - min)

const randomIcon = (not = -1) => {
  let i = not
  while (i === not) i = Math.floor(Math.random() * BACKDROP_ICONS.length)
  return i
}

/**
 * Keep-out radius: half the icon's diagonal footprint once tilted by up to
 * TILT degrees (s/2 · (cos θ + sin θ) ≈ 0.65 s at 18°). Spacing by this keeps
 * even the corners of two tilted icons apart.
 */
const reach = (size: number) => size * 0.65

/**
 * Scatter icons over a w × h area with variable-radius Poisson-disk sampling
 * (Bridson's algorithm): each new icon is placed at a random distance and
 * angle from an existing one, accepted only if it clears every neighbour by
 * GAP. The result looks hand-strewn but never overlaps.
 *
 * `keep` seeds the field, so a resize grows it around the icons already
 * on screen instead of reshuffling them.
 */
function scatter(w: number, h: number, keep: Cell[]): Cell[] {
  const maxReach = reach(SIZE_RANGE[1])
  // Two icons can only collide if their centres are within this distance, so
  // a bucket this big means each check only looks at the 3 × 3 buckets around it.
  const bucket = 2 * maxReach + GAP
  const grid = new Map<string, Cell[]>()
  const keyOf = (x: number, y: number) => `${Math.floor(x / bucket)},${Math.floor(y / bucket)}`
  const inBounds = (x: number, y: number) => x > -maxReach && x < w + maxReach && y > -maxReach && y < h + maxReach

  const fits = (x: number, y: number, size: number) => {
    const bx = Math.floor(x / bucket)
    const by = Math.floor(y / bucket)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const o of grid.get(`${bx + dx},${by + dy}`) ?? []) {
          if (Math.hypot(o.x - x, o.y - y) < reach(size) + reach(o.size) + GAP) return false
        }
      }
    }
    return true
  }

  const cells: Cell[] = []
  const add = (cell: Cell) => {
    cells.push(cell)
    const k = keyOf(cell.x, cell.y)
    grid.set(k, [...(grid.get(k) ?? []), cell])
  }

  for (const cell of keep) if (inBounds(cell.x, cell.y)) add(cell)
  if (!cells.length) {
    const size = between(SIZE_RANGE)
    add({ x: w / 2, y: h / 2, size, rotate: between([-TILT, TILT]), icon: signal(randomIcon()) })
  }

  const active = [...cells]
  while (active.length) {
    const a = Math.floor(Math.random() * active.length)
    const from = active[a]
    let placed = false
    for (let t = 0; t < TRIES && !placed; t++) {
      const size = between(SIZE_RANGE)
      // Just past touching, up to 60% further: close enough to fill the field,
      // loose enough not to look gridded.
      const dist = (reach(from.size) + reach(size) + GAP) * (1 + Math.random() * 0.6)
      const angle = Math.random() * Math.PI * 2
      const x = from.x + Math.cos(angle) * dist
      const y = from.y + Math.sin(angle) * dist
      if (inBounds(x, y) && fits(x, y, size)) {
        const cell = { x, y, size, rotate: between([-TILT, TILT]), icon: signal(randomIcon()) }
        add(cell)
        active.push(cell)
        placed = true
      }
    }
    if (!placed) active.splice(a, 1)
  }
  return cells
}

const layout = (keep: Cell[]) => scatter(innerWidth, innerHeight, keep)

/**
 * The lobby's backdrop: a quiet field of fantasy icons. Now and then one
 * shrinks away and a different one pops in. Static under reduced motion.
 */
export function IconBackdrop() {
  const [cells, setCells] = useState(() => layout([]))
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let timer = 0
    const onResize = () => {
      clearTimeout(timer)
      timer = window.setTimeout(() => setCells((prev) => layout(prev)), 150)
    }
    window.addEventListener('resize', onResize)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let timer = 0
    const schedule = () => {
      const [min, max] = SWAP_EVERY
      timer = window.setTimeout(swap, min + Math.random() * (max - min))
    }
    const swap = () => {
      const i = Math.floor(Math.random() * cells.length)
      const el = ref.current?.children[i] as HTMLElement | undefined
      const cell = cells[i]
      if (!el || !cell || document.hidden) return schedule()
      el.animate([{ scale: 1 }, { scale: 0 }], { duration: 220, easing: 'ease-in', fill: 'forwards' })
        .finished.then(() => {
          cell.icon.value = randomIcon(cell.icon.value)
          // Wait a frame for Preact to swap the SVG, then pop the new one in.
          requestAnimationFrame(() => {
            el.getAnimations().forEach((a) => a.cancel())
            el.animate([{ scale: 0 }, { scale: 1.2, offset: 0.6 }, { scale: 1 }], {
              duration: 380,
              easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)',
            })
          })
        })
        .catch(() => {})
      schedule()
    }
    schedule()
    return () => clearTimeout(timer)
  }, [cells])

  return (
    <div ref={ref} class="icon-backdrop" aria-hidden="true">
      {cells.map((cell, i) => (
        <BackdropIcon key={i} cell={cell} />
      ))}
    </div>
  )
}

function BackdropIcon({ cell }: { cell: Cell }) {
  const Icon = BACKDROP_ICONS[cell.icon.value]
  return (
    <span class="backdrop-icon" style={{ left: cell.x, top: cell.y, rotate: `${cell.rotate}deg` }}>
      <Icon width={cell.size} height={cell.size} />
    </span>
  )
}
