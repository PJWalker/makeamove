import { signal } from '@preact/signals'
import { IconDraw, IconFog, IconMeasure, IconPan, IconPing, IconSelect, IconShapes, IconText } from '../ui/icons'
import type { ComponentType } from 'preact'
import { useEffect } from 'preact/hooks'
import { Button } from '../ui/Button'

export type ToolId = 'select' | 'pan' | 'draw' | 'shape' | 'text' | 'ruler' | 'ping' | 'fog'

export const activeTool = signal<ToolId>('select')

const TOOLS: { id: ToolId; label: string; key: string; Icon: ComponentType<any>; gmOnly?: boolean }[] = [
  { id: 'select', label: 'Select', key: 'V', Icon: IconSelect },
  { id: 'pan', label: 'Pan', key: 'H', Icon: IconPan },
  { id: 'draw', label: 'Draw', key: 'P', Icon: IconDraw },
  { id: 'shape', label: 'Shapes', key: 'R', Icon: IconShapes },
  { id: 'text', label: 'Text', key: 'T', Icon: IconText },
  { id: 'ruler', label: 'Measure', key: 'M', Icon: IconMeasure },
  { id: 'ping', label: 'Ping', key: 'G', Icon: IconPing },
  { id: 'fog', label: 'Fog of war', key: 'F', Icon: IconFog, gmOnly: true },
]

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
}

export function Toolbar({ isGm }: { isGm: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return
      const tool = TOOLS.find((t) => t.key === e.key.toUpperCase() && (!t.gmOnly || isGm))
      if (tool) activeTool.value = tool.id
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isGm])

  return (
    <nav class="toolbar panel bevel strip dock-left chrome" aria-label="Canvas tools">
      {TOOLS.filter((t) => !t.gmOnly || isGm).map(({ id, label, key, Icon }) => (
        <Button
          key={id}
          variant="icon"
          label={`${label} (${key})`}
          pressed={activeTool.value === id}
          onClick={() => (activeTool.value = id)}
        >
          <Icon size={18} />
        </Button>
      ))}
    </nav>
  )
}
