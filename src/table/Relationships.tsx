import { useSignal } from '@preact/signals'
import type { RefObject } from 'preact'
import { useMemo, useRef } from 'preact/hooks'
import { canEdit, getCharacter, listCharacters, selectCharacter } from '../characters/api'
import { layoutWeb, relationshipNotes, relationshipsOf, relationshipWeb, removeRelationship, setRelationship, type NodePosition } from '../characters/relationships'
import type { CharacterView } from '../characters/store'
import type { Campaign } from '../store/campaign'
import { useY } from '../store/useY'
import { Button } from '../ui/Button'
import { IconDelete, IconExpand } from '../ui/icons'
import { Dialog } from './CampaignDialogs'
import { CharacterText } from './CharacterText'
import { showPanel } from './panelLayout'
import { dialogRequest } from './canvasState'

/*
 * Relationships (M9): a section on every character sheet listing how this
 * character sees others, each with notes; and a web of everyone's, in a
 * window anyone can open (campaign menu, palette, Characters panel).
 */

/** The Relationships section of a sheet. */
export function RelationshipsSection({ campaign, c }: { campaign: Campaign; c: CharacterView }) {
  const editable = canEdit(campaign, c)
  const json = useY(campaign.characters, () => JSON.stringify(relationshipsOf(campaign.characters, c.id)))
  const rels: { to: string; label: string }[] = JSON.parse(json)
  const others = useY(campaign.characters, () => listCharacters(campaign).filter((o) => o.id !== c.id && !rels.some((r) => r.to === o.id)))
  const adding = useSignal('')
  const open = useSignal<string | null>(null)

  return (
    <section class="sheet-section" aria-label="Relationships">
      <h3 class="sheet-heading">Relationships</h3>
      {rels.length > 0 && (
        <ul class="relationships">
          {rels.map((r) => {
            const other = getCharacter(campaign, r.to)
            if (!other) return null
            const expanded = open.value === r.to
            return (
              <li key={r.to} class="relationship">
                <div class="relationship-row">
                  <button type="button" class="relationship-name" onClick={() => selectCharacter(campaign, other.id)}>
                    {other.name}
                  </button>
                  <input
                    class="input bevel"
                    aria-label={`How ${c.name} sees ${other.name}`}
                    placeholder="Trusts, owes, fears…"
                    value={r.label}
                    disabled={!editable}
                    onChange={(e) => setRelationship(campaign.characters, c.id, r.to, e.currentTarget.value.trim())}
                  />
                  <Button variant="icon" size="sm" label={expanded ? 'Hide notes' : 'Notes'} pressed={expanded} onClick={() => (open.value = expanded ? null : r.to)}>
                    <IconExpand />
                  </Button>
                  {editable && (
                    <Button variant="icon" size="sm" label="Remove" onClick={() => removeRelationship(campaign.characters, c.id, r.to)}>
                      <IconDelete />
                    </Button>
                  )}
                </div>
                {expanded && <CharacterText campaign={campaign} c={c} field={relationshipNotes(r.to)} label="Notes" editable={editable} />}
              </li>
            )
          })}
        </ul>
      )}
      <div class="sheet-row">
        {editable && others.length > 0 && (
          <select
            class="input bevel"
            aria-label="Add a relationship"
            value={adding.value}
            onChange={(e) => {
              const to = e.currentTarget.value
              if (to) setRelationship(campaign.characters, c.id, to, '')
              adding.value = ''
              open.value = null
            }}
          >
            <option value="">Add a relationship…</option>
            {others.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        )}
        <Button size="sm" variant="ghost" onClick={() => openRelationshipWeb()}>
          Web
        </Button>
      </div>
    </section>
  )
}

/** Open the web, from anywhere (the campaign's dialog host has it). */
export const openRelationshipWeb = () => (dialogRequest.value = 'relationships')

const W = 640
const H = 440

/** Everyone's relationships as a web: characters as nodes, each relationship an arrow with its label. Nodes drag. */
export function RelationshipsDialog({ campaign, dialogRef }: { campaign: Campaign; dialogRef: RefObject<HTMLDialogElement> }) {
  const json = useY(campaign.characters, () => {
    const people = listCharacters(campaign)
    const ids = people.map((p) => p.id)
    return JSON.stringify({ people: people.map((p) => ({ id: p.id, name: p.name, kind: p.kind })), edges: relationshipWeb(campaign.characters, ids) })
  })
  const { people, edges } = JSON.parse(json) as {
    people: { id: string; name: string; kind: string }[]
    edges: { from: string; to: string; label: string }[]
  }
  // Only characters in a relationship, unless there are none yet.
  const linked = new Set(edges.flatMap((e) => [e.from, e.to]))
  const shown = people.filter((p) => linked.has(p.id))
  const dragged = useSignal<Record<string, NodePosition>>({})
  const ids = shown.map((p) => p.id)
  const pos = useMemo(() => layoutWeb(ids, edges, { width: W, height: H, fixed: dragged.value }), [json, dragged.value])
  const svgRef = useRef<SVGSVGElement>(null)

  const drag = (id: string, e: PointerEvent) => {
    const svg = svgRef.current
    if (!svg || e.button !== 0) return
    e.preventDefault()
    const box = svg.getBoundingClientRect()
    const at = (ev: PointerEvent) => ({ x: ((ev.clientX - box.left) / box.width) * W, y: ((ev.clientY - box.top) / box.height) * H })
    const start = at(e)
    let moved = false
    const move = (ev: PointerEvent) => {
      const p = at(ev)
      if (!moved && Math.hypot(p.x - start.x, p.y - start.y) < 4) return
      moved = true
      dragged.value = { ...dragged.value, [id]: p }
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      // A click opens the character's sheet.
      if (!moved) {
        selectCharacter(campaign, id)
        showPanel('characters')
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <Dialog dialogRef={dialogRef} title="Relationships">
      {shown.length ? (
        <svg ref={svgRef} class="relationship-web" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Relationships between characters">
          <defs>
            <marker id="rel-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" class="relationship-arrowhead" />
            </marker>
          </defs>
          {edges.map((e) => {
            const a = pos[e.from]
            const b = pos[e.to]
            if (!a || !b) return null
            // Two-way relationships bow apart so both labels read.
            const both = edges.some((x) => x.from === e.to && x.to === e.from)
            const dx = b.x - a.x
            const dy = b.y - a.y
            const d = Math.max(1, Math.hypot(dx, dy))
            const nx = -dy / d
            const ny = dx / d
            const bow = both ? 26 : 0
            const mx = (a.x + b.x) / 2 + nx * bow
            const my = (a.y + b.y) / 2 + ny * bow
            // Stop short of the node's circle.
            const end = { x: b.x - (dx / d) * NODE_R, y: b.y - (dy / d) * NODE_R }
            const start = { x: a.x + (dx / d) * NODE_R, y: a.y + (dy / d) * NODE_R }
            return (
              <g key={`${e.from}>${e.to}`}>
                <path class="relationship-edge" d={`M${start.x},${start.y} Q${mx},${my} ${end.x},${end.y}`} marker-end="url(#rel-arrow)" />
                {e.label && (
                  <text class="relationship-label" x={(start.x + end.x) / 2 * 0.5 + mx * 0.5} y={(start.y + end.y) / 2 * 0.5 + my * 0.5 - 4} text-anchor="middle">
                    {e.label}
                  </text>
                )}
              </g>
            )
          })}
          {shown.map((p) => {
            const at = pos[p.id]
            if (!at) return null
            return (
              <g key={p.id} class="relationship-node" data-npc={p.kind === 'npc' || undefined} transform={`translate(${at.x},${at.y})`} onPointerDown={(e) => drag(p.id, e as unknown as PointerEvent)}>
                <circle r={NODE_R} />
                <text class="relationship-initial" text-anchor="middle" dy="0.35em">
                  {p.name.trim()[0]?.toUpperCase()}
                </text>
                <text class="relationship-node-name" text-anchor="middle" y={NODE_R + 14}>
                  {p.name}
                </text>
              </g>
            )
          })}
        </svg>
      ) : (
        <p class="empty">No relationships yet. Add them from a character’s sheet.</p>
      )}
    </Dialog>
  )
}

const NODE_R = 20
