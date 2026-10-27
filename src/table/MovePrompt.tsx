import { useSignal, useSignalEffect } from '@preact/signals'
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks'
import { getCharacter, makeMove, moveRequest, startMove, systemOf, targetRequest } from '../characters/api'
import { needsChoice, planMove } from '../characters/moves'
import { derive } from '../characters/store'
import { inRange } from '../scene/measure'
import { activeTool } from '../scene/tools'
import type { Campaign } from '../store/campaign'
import { collapsedInto, reducedMotion } from '../ui/bubble'
import { Button } from '../ui/Button'
import { IconClose } from '../ui/icons'
import { lastPressed } from '../ui/pressed'
import { Segmented } from '../ui/Segmented'
import { chosenTargets, sceneDistance, targetPick } from './canvasState'

/*
 * What a move asks before it rolls, in a speech bubble beside the button that
 * started it (a sheet's roll, a hotbar slot, a move's glyph): first its
 * targets, picked on the map, then any stat, number, roll mode (advantage)
 * and extra bonus, with the formula as it will roll. The bubble grows out of
 * that button and shrinks back into it, like a chat popup out of the Chat
 * tab, but quicker, since the user asked for it. It follows the button as
 * sidebars slide; without one on screen it sits above the hotbar.
 */

const ENTER_MS = 150
const LEAVE_MS = 110
const EASE = 'cubic-bezier(0.2, 0.7, 0.2, 1)'
/** Between the button and the bubble, room for the tail. */
const GAP = 14
/** The closest the bubble comes to the window's edges. */
const MARGIN = 8
/** A button this close to the bottom (the hotbar) gets the bubble above it. */
const BOTTOM_BAND = 120

type Request = { kind: 'target' | 'ask'; moveId: string; characterId: string }

const cancel = () => {
  targetRequest.value = null
  moveRequest.value = null
}

/** The anchor's box, if it's still on screen. */
function anchorRect(el: Element | null): DOMRect | null {
  const r = el?.isConnected ? el.getBoundingClientRect() : null
  return r && r.width > 0 && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight ? r : null
}

export function MovePrompt({ campaign }: { campaign: Campaign }) {
  const live: Request | null = targetRequest.value
    ? { kind: 'target', ...targetRequest.value }
    : moveRequest.value
      ? { kind: 'ask', ...moveRequest.value }
      : null
  // What's on screen: the live request, or the last one while it shrinks away.
  const shown = useSignal<Request | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const anchor = useRef<Element | null>(null)
  const leaving = useRef<Animation | null>(null)

  // A new request takes the button just pressed as its anchor, unless that was in the bubble (targets → roll).
  useLayoutEffect(() => {
    if (!live) return
    const pressed = lastPressed()
    if (pressed && !ref.current?.contains(pressed)) anchor.current = pressed
    else if (!shown.value) anchor.current = null
    leaving.current?.cancel()
    leaving.current = null
    shown.value = live
  }, [live?.kind, live?.moveId, live?.characterId])

  // Shrink back into the button once the request is done or cancelled.
  useLayoutEffect(() => {
    if (live || !shown.value) return
    const el = ref.current
    if (!el || reducedMotion.matches) {
      shown.value = null
      return
    }
    const box = el.getBoundingClientRect()
    const a = el.animate([{ transform: getComputedStyle(el).transform, opacity: 1 }, collapsedInto(box, anchorRect(anchor.current))], {
      duration: LEAVE_MS,
      easing: 'ease-in',
      fill: 'forwards',
    })
    leaving.current = a
    a.finished.then(
      () => {
        if (leaving.current === a) shown.value = null
      },
      () => {},
    )
  }, [!!live])

  // Beside the button: to whichever side has room, or above it in the bottom band; without it, above the hotbar.
  const placed = useRef('')
  const place = () => {
    const el = ref.current
    if (!el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    const a = anchorRect(anchor.current)
    const clampX = (x: number) => Math.round(Math.min(Math.max(x, MARGIN), innerWidth - w - MARGIN))
    const clampY = (y: number) => Math.round(Math.min(Math.max(y, MARGIN), innerHeight - h - MARGIN))
    let side: string, left: number, top: number, tail: number
    if (!a) {
      side = 'none'
      left = clampX((innerWidth - w) / 2)
      top = clampY(innerHeight - h - 60)
      tail = 0
    } else if (a.top > innerHeight - BOTTOM_BAND) {
      side = 'above'
      left = clampX(a.left + a.width / 2 - w / 2)
      top = clampY(a.top - GAP - h)
      tail = Math.round(a.left + a.width / 2 - left)
    } else {
      const right = innerWidth - a.right - GAP - MARGIN >= w || a.left + a.width / 2 < innerWidth / 2
      side = right ? 'right' : 'left'
      left = clampX(right ? a.right + GAP : a.left - GAP - w)
      top = clampY(a.top + a.height / 2 - h / 2)
      tail = Math.round(a.top + a.height / 2 - top)
    }
    const key = `${side},${left},${top},${tail}`
    if (key === placed.current) return
    placed.current = key
    el.dataset.side = side
    el.style.left = `${left}px`
    el.style.top = `${top}px`
    el.style.setProperty('--tail', `${tail}px`)
  }

  const open = !!shown.value
  // Grow out of the button, then follow it while open: it slides with its sidebar and with autohide.
  useLayoutEffect(() => {
    if (!open) {
      placed.current = ''
      return
    }
    place()
    const el = ref.current
    if (el && !reducedMotion.matches) {
      const box = el.getBoundingClientRect()
      el.animate([collapsedInto(box, anchorRect(anchor.current)), { opacity: 1, offset: 0.4 }, { transform: 'none', opacity: 1 }], {
        duration: ENTER_MS,
        easing: EASE,
      })
    }
    let frame = 0
    const follow = () => {
      place()
      frame = requestAnimationFrame(follow)
    }
    frame = requestAnimationFrame(follow)
    return () => cancelAnimationFrame(frame)
  }, [open])

  // Hand a targeting request to the scene, so clicks on tokens target it.
  useSignalEffect(() => {
    const r = targetRequest.value
    const s = r && systemOf(campaign).actions.find((m) => m.id === r.moveId)?.target
    targetPick.value = r && s ? { max: s.max, actor: r.characterId } : null
    if (r) activeTool.value = 'select'
  })
  useEffect(() => () => cancel(), [])

  // Escape backs out, before the canvas uses it to clear the selection.
  useEffect(() => {
    if (!live) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      cancel()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [!!live])

  const req = shown.value
  const move = req ? systemOf(campaign).actions.find((m) => m.id === req.moveId) : undefined
  const c = req ? getCharacter(campaign, req.characterId) : undefined
  if (!req || !move || !c) return null

  return (
    <div ref={ref} class="roll-prompt panel bevel" role="dialog" aria-label={`${move.name} (${c.name})`} inert={!live}>
      <div class="roll-prompt-head">
        <span class="eyebrow">
          {move.name} · {c.name}
        </span>
        <Button variant="icon" size="sm" label="Cancel" onClick={cancel}>
          <IconClose />
        </Button>
      </div>
      <p class="roll-prompt-desc">{move.text}</p>
      {req.kind === 'target' ? (
        <TargetStep campaign={campaign} characterId={c.id} moveId={move.id} />
      ) : (
        <AskStep campaign={campaign} characterId={c.id} moveId={move.id} />
      )}
      <span class="roll-prompt-tail" aria-hidden="true" />
    </div>
  )
}

/** Targets, picked by clicking tokens on the map. */
function TargetStep({ campaign, characterId, moveId }: { campaign: Campaign; characterId: string; moveId: string }) {
  const move = systemOf(campaign).actions.find((m) => m.id === moveId)!
  const spec = move.target!
  const targets = chosenTargets.value
  const ready = targets.length >= spec.min
  const fmt = sceneDistance.value
  const wanted = spec.max === 1 ? 'one target' : spec.max ? `up to ${spec.max} targets` : 'any number of targets'
  const go = () => {
    if (!ready) return
    const picked = targets.map((t) => ({ id: t.id, name: t.name, ...(t.distance !== null ? { distance: fmt(t.distance) } : {}) }))
    startMove(campaign, characterId, move, picked)
  }
  return (
    <div class="move-form">
      <p class="roll-prompt-text">{spec.prompt}</p>
      {targets.length ? (
        <span class="roll-prompt-targets">
          {targets.map((t) => {
            const out = spec.range && t.distance !== null && inRange(t.distance, spec.range) === 'out'
            return (
              <span key={t.id} class="target-chip" data-out={out || undefined} title={out ? 'Out of range' : undefined}>
                {t.name}
                {t.distance !== null && <span class="muted"> {fmt(t.distance)}</span>}
              </span>
            )
          })}
        </span>
      ) : (
        <span class="muted">Click a token on the map: {wanted}.</span>
      )}
      <Button variant="primary" disabled={!ready} onClick={go}>
        {move.name}
      </Button>
    </div>
  )
}

/** A formula without its labels, as the Roll button reads: 1d20+2[Prof] → 1d20+2. */
const bare = (formula: string) => formula.replace(/\[[^\]]*\]/g, '')

/** The stat or number the check needs, the roll mode and an extra bonus, then Roll. */
function AskStep({ campaign, characterId, moveId }: { campaign: Campaign; characterId: string; moveId: string }) {
  const system = systemOf(campaign)
  const move = system.actions.find((m) => m.id === moveId)!
  const c = getCharacter(campaign, characterId)!
  const targets = moveRequest.value?.targets
  const stat = useSignal('')
  const bond = useSignal(1)
  const extra = useSignal(0)
  const mode = useSignal('')
  const formRef = useRef<HTMLFormElement>(null)
  // Enter rolls straight away.
  useEffect(() => formRef.current?.querySelector<HTMLButtonElement>('button[type="submit"]')?.focus({ preventScroll: true }), [])

  const ask = needsChoice(move)
  const choice = { stat: stat.value || undefined, ask: bond.value, extra: extra.value, mode: mode.value || undefined }
  const ready = ask?.kind !== 'stat' || !!stat.value
  const formula = ready ? planMove(system, move, c, derive(c, system), choice).formula : ''
  const go = () => {
    if (!ready) return
    void makeMove(campaign, c.id, move, choice, targets)
    moveRequest.value = null
  }

  return (
    <form
      ref={formRef}
      class="move-form"
      onSubmit={(e) => {
        e.preventDefault()
        go()
      }}
    >
      {ask?.kind === 'stat' && (
        <div class="field" role="radiogroup" aria-label="Stat to roll">
          Roll which stat?
          <div class="move-stats">
            {system.stats.map((s) => (
              <Button key={s.id} size="sm" pressed={stat.value === s.id} onClick={() => (stat.value = s.id)}>
                {s.abbr}
              </Button>
            ))}
          </div>
        </div>
      )}
      {ask?.kind === 'number' && (
        <label class="field">
          {ask.prompt}
          <input
            class="input bevel"
            type="number"
            min={ask.min}
            max={ask.max}
            value={bond.value}
            onInput={(e) => (bond.value = Number(e.currentTarget.value) || 0)}
          />
        </label>
      )}
      {system.rollModes && (
        <Segmented
          label="Roll"
          value={mode.value}
          options={[{ id: '', label: 'Normal' }, ...system.rollModes.map((m) => ({ id: m.id, label: m.label }))]}
          onChange={(v) => (mode.value = v)}
        />
      )}
      <label class="field roll-prompt-extra">
        Extra bonus
        <input
          class="input bevel"
          type="number"
          min={-10}
          max={10}
          value={extra.value}
          onInput={(e) => (extra.value = Number(e.currentTarget.value) || 0)}
        />
      </label>
      <Button variant="primary" type="submit" disabled={!ready} title={formula || undefined}>
        {ready ? `Roll ${bare(formula)}` : 'Pick a stat'}
      </Button>
    </form>
  )
}
