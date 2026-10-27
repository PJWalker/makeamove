import type { ComponentType } from 'preact'
import { useEffect } from 'preact/hooks'
import { signal, useSignal } from '@preact/signals'
import { goToCampaign } from '../router'
import { startReorder } from '../ui/reorder'
import { activeTool, pen, PEN_WIDTHS, setPen, setShapeTool, shapeTool, type ToolId } from '../scene/tools'
import { SHAPES, type ShapeKind } from '../scene/types'
import { Button } from '../ui/Button'
import {
  IconDraw,
  IconEraser,
  IconFog,
  IconHelp,
  IconRelationships,
  IconLeave,
  IconMeasure,
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
import { layout, PANEL_ORDER, setPanelClosed, unavailablePanels } from './panelLayout'
import { PANELS } from './panels'
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
  { id: 'shape', label: 'Shapes', key: 'R', Icon: IconShapes },
  { id: 'text', label: 'Text', key: 'X', Icon: IconText },
  { id: 'ruler', label: 'Measure', key: 'M', Icon: IconMeasure },
  { id: 'ping', label: 'Ping', key: 'G', Icon: IconPing },
  { id: 'fog', label: 'Fog of war', key: 'F', Icon: IconFog, gmOnly: true, arrives: 'M12' },
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
      <nav class="toolbar panel bevel strip across dock-top" aria-label="Canvas tools">
        <CampaignMenu />
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
      {(activeTool.value === 'draw' || activeTool.value === 'shape' || activeTool.value === 'text') && <PenOptions tool={activeTool.value} />}
    </>
  )
}

/**
 * The campaign menu, at the start of the tool strip: settings, help and the
 * way back to the campaign list. Opens on the press, like every menu, so
 * press, move to an item and release chooses it.
 */
function CampaignMenu() {
  const menu = useSignal<{ x: number; y: number; press?: { x: number; y: number } } | null>(null)
  const items: MenuItem[] = [
    { label: 'Settings…', Icon: IconSettings, onSelect: () => (dialogRequest.value = 'settings') },
    { label: 'Relationships…', Icon: IconRelationships, onSelect: () => (dialogRequest.value = 'relationships') },
    { label: 'Help and shortcuts…', Icon: IconHelp, onSelect: () => (dialogRequest.value = 'help') },
    'divider',
    // Which panels the table has: ticked ones are in a sidebar or a window.
    ...PANEL_ORDER.filter((id) => !unavailablePanels.value.includes(id)).map(
      (id): MenuItem => ({
        label: PANELS[id].label,
        Icon: PANELS[id].Icon,
        checked: !layout.value.closed.includes(id),
        onSelect: () => setPanelClosed(id, !layout.value.closed.includes(id)),
      }),
    ),
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

/** Colour, width and layer for the pen (and the shape for the Shapes tool), beside the tool strip. */
function PenOptions({ tool }: { tool: ToolId }) {
  const { colour, width, layer } = pen.value
  return (
    <div class="pen-options panel bevel" role="group" aria-label="Pen">
      {tool === 'shape' && (
        <div class="pen-widths" role="radiogroup" aria-label="Shape">
          {SHAPES.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              class="pen-width pen-shape bevel"
              aria-checked={shapeTool.value === s.id}
              aria-label={s.label}
              title={s.label}
              onClick={() => setShapeTool(s.id)}
            >
              <ShapeGlyph shape={s.id} colour={colour} />
            </button>
          ))}
        </div>
      )}
      <input
        type="color"
        class="pen-colour"
        value={colour}
        aria-label="Pen colour"
        title="Pen colour"
        onInput={(e) => setPen({ colour: e.currentTarget.value })}
      />
      {tool === 'draw' && <div class="pen-widths" role="radiogroup" aria-label="Width">
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
      </div>}
      <button
        type="button"
        class="pen-layer bevel"
        aria-pressed={layer === 'under'}
        title="Under or over tokens"
        onClick={() => setPen({ layer: layer === 'under' ? 'over' : 'under' })}
      >
        {layer === 'under' ? 'Under tokens' : 'Over tokens'}
      </button>
    </div>
  )
}

/** A small picture of a shape for its button. */
function ShapeGlyph({ shape, colour }: { shape: ShapeKind; colour: string }) {
  const common = { fill: colour, 'fill-opacity': 0.3, stroke: colour, 'stroke-width': 2 }
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      {shape === 'rect' && <rect x="3" y="3" width="12" height="12" {...common} />}
      {shape === 'circle' && <circle cx="9" cy="9" r="6.5" {...common} />}
      {shape === 'line' && <rect x="1" y="7" width="16" height="4" {...common} />}
      {shape === 'cone' && <polygon points="2,9 16,2 16,16" {...common} />}
    </svg>
  )
}
