import { useSignal } from '@preact/signals'
import { useEffect } from 'preact/hooks'
import { selectedCharacterId } from '../characters/api'
import { editHotbar, hotbarSlots, shift, unpin } from '../characters/hotbar'
import { buildIndex } from '../actions/registry'
import { noteRecent } from '../actions/recent'
import type { Campaign } from '../store/campaign'
import { useY } from '../store/useY'
import { isTyping } from '../ui/keys'
import { Button } from '../ui/Button'
import { sidebarOpen, sidebarWidth } from './panelLayout'

/** Pinned actions for the selected character, docked at the bottom centre. */
export function Hotbar({ campaign }: { campaign: Campaign }) {
  const editing = useSignal(false)
  const charId = useY(campaign.members, () => selectedCharacterId(campaign))
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
  const inset = (sidebarOpen.value ? sidebarWidth.value : 0) + 56

  return (
    <div class="hotbar-wrap" style={{ right: `${inset}px` }}>
      <div class="hotbar panel bevel chrome" role="toolbar" aria-label="Hotbar">
        {slots.map((id, i) => {
          const a = index.get(id)
          if (!a) return null
          return (
            <div key={id} class="hotbar-slot" data-unavailable={a.available !== true}>
              <button
                type="button"
                class="hotbar-btn bevel"
                disabled={a.available !== true}
                title={a.available === true ? a.detail ?? a.title : `${a.title}: ${a.available}`}
                onClick={() => run(id)}
              >
                {i < 9 && <kbd>{i + 1}</kbd>}
                <span>{a.title}</span>
              </button>
              {editing.value && (
                <span class="hotbar-edit">
                  <Button variant="icon" size="sm" label={`Move ${a.title} left`} disabled={i === 0} onClick={() => edit((s) => shift(s, id, -1))}>
                    ‹
                  </Button>
                  <Button variant="icon" size="sm" label={`Move ${a.title} right`} disabled={i === slots.length - 1} onClick={() => edit((s) => shift(s, id, 1))}>
                    ›
                  </Button>
                  <Button variant="icon" size="sm" label={`Remove ${a.title}`} onClick={() => edit((s) => unpin(s, id))}>
                    ×
                  </Button>
                </span>
              )}
            </div>
          )
        })}
        <Button
          variant="icon"
          size="sm"
          label={editing.value ? 'Done editing hotbar' : 'Edit hotbar (Alt+Enter in the palette pins more)'}
          pressed={editing.value}
          disabled={!charId}
          onClick={() => (editing.value = !editing.value)}
        >
          ✎
        </Button>
      </div>
    </div>
  )
}
