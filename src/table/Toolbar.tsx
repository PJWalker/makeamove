import type { ComponentType } from 'preact'
import { useEffect } from 'preact/hooks'
import { activeTool, pen, PEN_WIDTHS, setPen, type ToolId } from '../scene/tools'
import { Button } from '../ui/Button'
import {
  IconDraw,
  IconEraser,
  IconFog,
  IconMeasure,
  IconPan,
  IconPing,
  IconSelect,
  IconShapes,
  IconText,
  type IconProps,
} from '../ui/icons'
import { isTyping } from '../ui/keys'

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
  { id: 'text', label: 'Text', key: 'T', Icon: IconText, arrives: 'a later milestone' },
  { id: 'ruler', label: 'Measure', key: 'M', Icon: IconMeasure },
  { id: 'ping', label: 'Ping', key: 'G', Icon: IconPing },
  { id: 'fog', label: 'Fog of war', key: 'F', Icon: IconFog, gmOnly: true, arrives: 'M5' },
]

export function Toolbar({ isGm }: { isGm: boolean }) {
  const tools = TOOLS.filter((t) => !t.gmOnly || isGm)

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
      <nav class="toolbar panel bevel strip dock-left chrome" aria-label="Canvas tools">
        {tools.map(({ id, label, key, Icon, arrives }) => (
          <Button
            key={id}
            variant="icon"
            label={arrives ? `${label} arrives in ${arrives}` : `${label} (${key})`}
            pressed={activeTool.value === id}
            disabled={!!arrives}
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
