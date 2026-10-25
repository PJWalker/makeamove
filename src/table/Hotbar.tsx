import { useSignal } from '@preact/signals'
import { useEffect, useRef } from 'preact/hooks'
import { selectedCharacterId } from '../characters/api'
import { editHotbar, hotbarSlots, moveTo, shift, unpin } from '../characters/hotbar'
import { buildIndex } from '../actions/registry'
import { noteRecent } from '../actions/recent'
import type { Campaign } from '../store/campaign'
import { useY } from '../store/useY'
import { isTyping } from '../ui/keys'

/**
 * Pinned actions for the selected character, docked at the bottom centre.
 * Drag a slot to reorder it, or drag it off the bar to remove it. With a
 * slot focused, Alt+Left/Right reorder and Delete removes, for the keyboard.
 */
export function Hotbar({ campaign }: { campaign: Campaign }) {
  const charId = useY(campaign.members, () => selectedCharacterId(campaign))
  const dragging = useSignal<string | null>(null)
  // Where the dragged slot would land: the target slot and which side of it.
  const drop = useSignal<{ id: string; side: 'before' | 'after' } | null>(null)
  const barRef = useRef<HTMLDivElement>(null)
  // Rebuilt on any change to characters or members so labels and availability stay current.
  const tick = useSignal(0)
  useEffect(() => {
    const bump = () => tick.value++
    campaign.characters.observeDeep(bump)
    campaign.members.observeDeep(bump)
    return () => {
      campaign.characters.unobserveDeep(bump)
      campaign.members.unobserveDeep(bump)
    }
  }, [campaign])
  void tick.value

  const slots = hotbarSlots(campaign, charId)
  const index = new Map(buildIndex(campaign).map((a) => [a.id, a]))
  const run = (id: string) => {
    const a = index.get(id)
    if (a?.available !== true) return
    noteRecent(a.id)
    a.run()
  }

  // 1–9 trigger the first nine slots.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || isTyping(e.target)) return
      if (!/^[1-9]$/.test(e.key)) return
      const id = slots[Number(e.key) - 1]
      if (id) {
        e.preventDefault()
        run(id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const edit = (fn: (s: string[]) => string[]) => editHotbar(campaign, fn)
  const endDrag = () => {
    dragging.value = null
    drop.value = null
  }

  return (
    <div class="hotbar-wrap">
      <div
        ref={barRef}
        class="hotbar panel bevel chrome"
        role="toolbar"
        aria-label="Hotbar"
        data-dragging={dragging.value !== null}
        onDragOver={(e) => {
          if (dragging.value) e.preventDefault()
        }}
        onDrop={(e) => {
          e.preventDefault()
          const id = dragging.value
          const d = drop.value
          if (id && d) {
            const at = slots.indexOf(d.id) + (d.side === 'after' ? 1 : 0)
            edit((s) => moveTo(s, id, at))
          } else if (id) {
            // Dropped on the bar but not on a slot: to the end.
            edit((s) => moveTo(s, id, s.length))
          }
          endDrag()
        }}
      >
        {slots.map((id, i) => {
          const a = index.get(id)
          if (!a) return null
          const off = a.available !== true
          return (
            <div
              key={id}
              class="hotbar-slot"
              data-unavailable={off}
              data-dragging={dragging.value === id}
              data-drop={drop.value?.id === id && dragging.value !== id ? drop.value.side : undefined}
              draggable
              onDragStart={(e) => {
                dragging.value = id
                e.dataTransfer!.effectAllowed = 'move'
                e.dataTransfer!.setData('text/plain', a.title)
              }}
              onDragOver={(e) => {
                if (!dragging.value) return
                e.preventDefault()
                const r = e.currentTarget.getBoundingClientRect()
                const side = e.clientX < r.left + r.width / 2 ? 'before' : 'after'
                if (drop.value?.id !== id || drop.value.side !== side) drop.value = { id, side }
              }}
              onDragEnd={(e) => {
                // Released off the bar (not cancelled with Escape): unpin.
                const r = barRef.current?.getBoundingClientRect()
                const cancelled = e.clientX === 0 && e.clientY === 0
                const outside =
                  r && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
                if (dragging.value && !cancelled && outside) edit((s) => unpin(s, id))
                endDrag()
              }}
            >
              <div
                role="button"
                tabIndex={0}
                class="hotbar-btn bevel"
                aria-disabled={off}
                title={off ? `${a.title}: ${a.available}` : (a.detail ?? a.title)}
                onClick={() => run(id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    run(id)
                  } else if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                    e.preventDefault()
                    edit((s) => shift(s, id, e.key === 'ArrowLeft' ? -1 : 1))
                  } else if (e.key === 'Delete' || e.key === 'Backspace') {
                    e.preventDefault()
                    edit((s) => unpin(s, id))
                  }
                }}
              >
                {i < 9 && <kbd>{i + 1}</kbd>}
                <span>{a.title}</span>
              </div>
            </div>
          )
        })}
        {dragging.value ? (
          <p class="hotbar-hint">Drop off the bar to remove</p>
        ) : (
          !slots.length && <p class="hotbar-hint">Alt+Enter in the palette pins here</p>
        )}
      </div>
    </div>
  )
}
