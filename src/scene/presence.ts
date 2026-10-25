import type { Awareness } from 'y-protocols/awareness'
import { oklabToHex } from '../lib/colour'
import type { Point } from './grid'

/** A member's colour, derived from their device id so every peer agrees on it. */
export function colourFor(id: string): string {
  let hash = 0
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  const h = ((Math.abs(hash) % 360) * Math.PI) / 180
  return oklabToHex({ L: 0.7, a: 0.13 * Math.cos(h), b: 0.13 * Math.sin(h) })
}

/** The colour a device shows as: its own choice, else one derived from its id. */
export const colourOf = (d: { id: string; colour?: string }) => d.colour ?? colourFor(d.id)

/** How long a ping ripples, in ms. */
export const PING_MS = 2600

/** How long a laser trail takes to fade, in ms. */
export const TRAIL_MS = 1100

export interface Ruler {
  a: Point
  b: Point
}

/** What one member is doing on the current scene. */
export interface PresenceMark {
  id: string
  name: string
  colour: string
  self: boolean
  cursor: Point | null
  ping: { p: Point; startedAt: number } | null
  ruler: Ruler | null
  /** Recent laser-pointer points, newest last; t is local performance.now(). */
  trail: { x: number; y: number; t: number }[] | null
}

interface LocalState {
  scene: string | null
  cursor: Point | null
  ping: { x: number; y: number; n: number } | null
  ruler: Ruler | null
  /** Flat x, y, age-in-ms triples, so peers can fade it on their own clocks. */
  trail: number[] | null
  /** Bumps whenever the trail changes, so unrelated updates (cursor moves) don't restart its fade. */
  trailN?: number
}

interface RemoteState extends LocalState {
  user?: { id: string; name: string; colour?: string }
}

/**
 * Cursors, pings and rulers. Everything here is ephemeral: it rides on Yjs
 * awareness, so it reaches peers while they're connected and is never stored.
 * With no connection it still tracks this device's own pings and rulers.
 */
export class Presence {
  private awareness: Awareness | null = null
  private local: LocalState = { scene: null, cursor: null, ping: null, ruler: null, trail: null }
  private listeners = new Set<() => void>()
  /** When each peer's latest ping first reached us, so animation uses our own clock. */
  private seen = new Map<string, { n: number; startedAt: number }>()
  private pingCount = 0
  /** When each peer's latest trail update reached us, to age its points locally. */
  private trailSeen = new Map<string, { n: number | undefined; at: number }>()
  private trailCount = 0
  private localTrail: { x: number; y: number; t: number }[] = []
  private localPing: { p: Point; startedAt: number } | null = null

  attach(awareness: Awareness) {
    this.awareness = awareness
    awareness.on('change', this.emit)
    awareness.setLocalStateField('presence', this.local)
  }

  detach() {
    this.awareness?.off('change', this.emit)
    this.awareness = null
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit = () => {
    for (const fn of this.listeners) fn()
  }

  private publish(patch: Partial<LocalState>) {
    this.local = { ...this.local, ...patch }
    this.awareness?.setLocalStateField('presence', this.local)
    this.emit()
  }

  setScene(scene: string | null) {
    this.localTrail = []
    this.publish({ scene, cursor: null, ping: null, ruler: null, trail: null })
    this.localPing = null
  }

  setCursor(cursor: Point | null) {
    this.publish({ cursor })
  }

  setRuler(ruler: Ruler | null) {
    this.publish({ ruler })
  }

  ping(p: Point) {
    this.localPing = { p, startedAt: performance.now() }
    this.publish({ ping: { x: p.x, y: p.y, n: ++this.pingCount } })
  }

  /** Add a point to the laser trail; the first one replaces the ping ripple. */
  trailTo(p: Point) {
    const now = performance.now()
    if (!this.localTrail.length) this.localPing = null
    this.localTrail.push({ ...p, t: now })
    this.publishTrail(now, !this.localTrail.length ? undefined : { ping: null })
  }

  /** Send the final trail so peers can finish fading it. */
  endTrail() {
    if (this.localTrail.length) this.publishTrail(performance.now())
  }

  private publishTrail(now: number, extra?: Partial<LocalState>) {
    this.localTrail = this.localTrail.filter((q) => now - q.t < TRAIL_MS)
    this.publish({ trailN: ++this.trailCount, trail: this.localTrail.flatMap((q) => [q.x, q.y, Math.round(now - q.t)]), ...extra })
  }

  /** Everyone on `scene`, this device included. */
  marks(scene: string, selfId: string, selfName: string, selfColour = colourFor(selfId)): PresenceMark[] {
    const now = performance.now()
    const marks: PresenceMark[] = []
    const mine = this.local
    marks.push({
      id: selfId,
      name: selfName,
      colour: selfColour,
      self: true,
      cursor: null,
      ping: this.localPing && now - this.localPing.startedAt < PING_MS ? this.localPing : null,
      ruler: mine.scene === scene ? mine.ruler : null,
      trail: this.localTrail.length ? this.localTrail : null,
    })
    const states = this.awareness?.getStates()
    if (!states) return marks
    for (const [client, raw] of states) {
      if (client === this.awareness!.clientID) continue
      const user = (raw as { user?: RemoteState['user'] }).user
      const p = (raw as { presence?: LocalState }).presence
      if (!user || !p || p.scene !== scene) continue
      let ping: PresenceMark['ping'] = null
      if (p.ping) {
        const key = String(client)
        let s = this.seen.get(key)
        if (!s || s.n !== p.ping.n) {
          s = { n: p.ping.n, startedAt: now }
          this.seen.set(key, s)
        }
        if (now - s.startedAt < PING_MS) ping = { p: { x: p.ping.x, y: p.ping.y }, startedAt: s.startedAt }
      }
      let trail: PresenceMark['trail'] = null
      if (p.trail?.length) {
        const key = String(client)
        let seen = this.trailSeen.get(key)
        if (!seen || seen.n !== p.trailN) {
          seen = { n: p.trailN, at: now }
          this.trailSeen.set(key, seen)
        }
        trail = []
        for (let i = 0; i + 2 < p.trail.length; i += 3) {
          const t = seen.at - p.trail[i + 2]
          if (now - t < TRAIL_MS) trail.push({ x: p.trail[i], y: p.trail[i + 1], t })
        }
      }
      marks.push({ id: user.id, name: user.name, colour: user.colour ?? colourFor(user.id), self: false, cursor: p.cursor, ping, ruler: p.ruler, trail })
    }
    return marks
  }
}
