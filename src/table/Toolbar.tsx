import type { ComponentType } from 'preact'
import { useEffect } from 'preact/hooks'
import { signal, useSignal } from '@preact/signals'
import { goToCampaign } from '../router'
import { startReorder } from '../ui/reorder'
import { activeTool, pen, PEN_WIDTHS, setPen, type ToolId } from '../scene/tools'
import { Button } from '../ui/Button'
import {
  IconDraw,
  IconEraser,
  IconFog,
  IconHelp,
  IconLeave,
  IconMeasure,
  IconMembers,
  IconMenu,
  IconSettings,
  IconPan,
  IconPing,
  IconSelect,
  IconShapes,
  IconText,
  type IconProps,
} from '../ui/icons'
import { isTyping } from '../ui/keys'
import { dialogRequest } from './canvasState'
import { ContextMenu, type MenuItem } from './ContextMenu'

export const TOOLS: {
  id: ToolId
  label: string
  key: string
  Icon: ComponentType<IconProps>
  gmOnly?: boolean
  /** The milestone that brings this tool, while it isn't built yet. */
  arrives?: string
}[] = [
  { id: 'select', label: 'Select', key: 'V', Icon: IconSelect },
  { id: 'pan', label: 'Pan', key: 'H', Icon: IconPan },
  { id: 'draw', label: 'Draw', key: 'P', Icon: IconDraw },
  { id: 'erase', label: 'Erase', key: 'E', Icon: IconEraser },
  { id: 'shape', label: 'Shapes', key: 'R', Icon: IconShapes, arrives: 'a later milestone' },
  { id: 'text', label: 'Text', key: 'X', Icon: IconText, arrives: 'a later milestone' },
  { id: 'ruler', label: 'Measure', key: 'M', Icon: IconMeasure },
  { id: 'ping', label: 'Ping', key: 'G', Icon: IconPing },
  { id: 'fog', label: 'Fog of war', key: 'F', Icon: IconFog, gmOnly: true, arrives: 'M6' },
]

const ORDER_KEY = 'mam:tool-order'

/** The player's own tool order, kept per device. */
const toolOrder = signal<ToolId[]>(
  (() => {
    try {
      return JSON.parse(localStorage.getItem(ORDER_KEY) ?? '[]')
    } catch {
      return []
    }
  })(),
)

/** Tools in the player's order; any not mentioned keep their default place after the others. */
function inOrder(tools: typeof TOOLS, order: ToolId[]) {
  const rank = (id: ToolId) => (order.includes(id) ? order.indexOf(id) : order.length + TOOLS.findIndex((t) => t.id === id))
  return [...tools].sort((a, b) => rank(a.id) - rank(b.id))
}

export function Toolbar({ isGm }: { isGm: boolean }) {
  const tools = inOrder(TOOLS.filter((t) => !t.gmOnly || isGm), toolOrder.value)

  function dragTool(id: ToolId, e: PointerEvent) {
    const bar = (e.currentTarget as HTMLElement).closest<HTMLElement>('.toolbar')!
    startReorder({
      event: e,
      axis: 'x',
      container: bar,
      items: () => [...bar.querySelectorAll<HTMLElement>('[data-tool]')],
      onDrop: (index) => {
        const ids = tools.map((t) => t.id).filter((t) => t !== id)
        ids.splice(index, 0, id)
        // Hidden (GM-only) tools keep their place among the rest.
        const hidden = TOOLS.map((t) => t.id).filter((t) => !ids.includes(t))
        toolOrder.value = [...ids, ...hidden]
        try {
          localStorage.setItem(ORDER_KEY, JSON.stringify(toolOrder.value))
        } catch {
          // The order just won't persist.
        }
      },
    })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || (e.target as Element).closest?.('dialog')) return
      const tool = tools.find((t) => t.key === e.key.toUpperCase() && !t.arrives)
      if (tool) activeTool.value = tool.id
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isGm])

  return (
    <>
      <nav class="toolbar panel bevel strip across dock-top chrome" aria-label="Canvas tools">
        <CampaignMenu isGm={isGm} />
        {tools.map(({ id, label, key, Icon, arrives }) => (
          <Button
            key={id}
            variant="icon"
            label={arrives ? `${label} arrives in ${arrives}` : `${label} (${key})`}
            pressed={activeTool.value === id}
            disabled={!!arrives}
            data-tool={id}
            onPointerDown={(e: PointerEvent) => dragTool(id, e)}
            onClick={() => (activeTool.value = id)}
          >
            <Icon size={22} />
          </Button>
        ))}
      </nav>
      {activeTool.value === 'draw' && <PenOptions />}
    </>
  )
}

/**
 * The campaign menu, at the start of the tool strip: settings, help and the
 * way back to the campaign list. Opens on the press, like every menu, so
 * press, move to an item and release chooses it.
 */
function CampaignMenu({ isGm }: { isGm: boolean }) {
  const menu = useSignal<{ x: number; y: number; press?: { x: number; y: number } } | null>(null)
  const items: MenuItem[] = [
    { label: 'Player settings…', Icon: IconMembers, onSelect: () => (dialogRequest.value = 'player') },
    ...(isGm ? [{ label: 'Campaign settings…', Icon: IconSettings, onSelect: () => (dialogRequest.value = 'settings') }] : []),
    { label: 'Help and shortcuts…', Icon: IconHelp, onSelect: () => (dialogRequest.value = 'help') },
    'divider',
    { label: 'Back to campaigns', Icon: IconLeave, onSelect: () => goToCampaign(null) },
  ]
  const openBelow = (el: HTMLElement, press?: { x: number; y: number }) => {
    const r = el.getBoundingClientRect()
    menu.value = { x: r.left, y: r.bottom + 6, press }
  }
  return (
    <>
      <Button
        variant="icon"
        label="Campaign menu"
        class="toolbar-menu"
        pressed={!!menu.value}
        aria-haspopup="menu"
        aria-expanded={!!menu.value}
        onPointerDown={(e: PointerEvent) => {
          if (e.button !== 0) return
          if (menu.value) {
            menu.value = null
            return
          }
          openBelow(e.currentTarget as HTMLElement, { x: e.clientX, y: e.clientY })
        }}
        // From the keyboard: Enter or Space.
        onClick={(e: MouseEvent) => {
          if (e.detail === 0 && !menu.value) openBelow(e.currentTarget as HTMLElement)
        }}
      >
        <IconMenu size={22} />
      </Button>
      {menu.value && (
        <ContextMenu {...menu.value} items={items} button={0} label="Campaign menu" onClose={() => (menu.value = null)} />
      )}
    </>
  )
}

/** Colour, width and layer for the pen, beside the tool strip. */
function PenOptions() {
  const { colour, width, layer } = pen.value
  return (
    <div class="pen-options panel bevel chrome" role="group" aria-label="Pen">
      <input
        type="color"
        class="pen-colour"
        value={colour}
        aria-label="Pen colour"
        title="Pen colour"
        onInput={(e) => setPen({ colour: e.currentTarget.value })}
      />
      <div class="pen-widths" role="radiogroup" aria-label="Width">
        {PEN_WIDTHS.map((w, i) => (
          <button
            key={w}
            type="button"
            role="radio"
            class="pen-width bevel"
            aria-checked={w === width}
            aria-label={['Thin', 'Medium', 'Thick'][i]}
            title={['Thin', 'Medium', 'Thick'][i]}
            onClick={() => setPen({ width: w })}
          >
            <span style={{ width: `${w + 2}px`, height: `${w + 2}px`, background: colour }} />
          </button>
        ))}
      </div>
      <button
        type="button"
        class="pen-layer bevel"
        aria-pressed={layer === 'under'}
        title="Draw under tokens, for terrain and spell areas"
        onClick={() => setPen({ layer: layer === 'under' ? 'over' : 'under' })}
      >
        {layer === 'under' ? 'Under tokens' : 'Over tokens'}
      </button>
    </div>
  )
}
