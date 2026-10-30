import type { ComponentChildren } from 'preact'
import type { Icon } from '../ui/icons'
import { IconClose, IconSidebar } from '../ui/icons'
import { Button } from '../ui/Button'
import { withTransition } from '../ui/transition'

export function WindowControls({
  title,
  Icon: WindowIcon,
  iconContent,
  beforeTitle,
  rolled,
  onToggleRoll,
  onDragStart,
  onDockMenu,
  onClose,
  closeLabel = 'Close',
}: {
  title: string
  Icon?: Icon
  iconContent?: ComponentChildren
  beforeTitle?: ComponentChildren
  rolled: boolean
  onToggleRoll: () => void
  onDragStart: (event: PointerEvent) => void
  onDockMenu?: (x: number, y: number) => void
  onClose?: () => void
  closeLabel?: string
}) {
  return (
    <header
      class="panel-header window-header"
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest('button')) return
        onDragStart(event)
      }}
      onDblClick={(event) => {
        if ((event.target as HTMLElement).closest('button')) return
        const scope = event.currentTarget.closest<HTMLElement>('.window') ?? undefined
        if (!rolled) scope?.focus({ preventScroll: true })
        void withTransition(onToggleRoll, { scope })
      }}
    >
      {iconContent ?? (WindowIcon && <span class="window-icon" aria-hidden="true"><WindowIcon size={16} /></span>)}
      {!rolled && beforeTitle}
      <h2 class="panel-title">{title}</h2>
      {!rolled && onDockMenu && (
        <Button
          variant="icon"
          label="Dock or move window"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => onDockMenu(event.clientX, event.clientY)}
        >
          <IconSidebar size={16} />
        </Button>
      )}
      {!rolled && onClose && (
        <Button variant="icon" label={closeLabel} onClick={onClose}>
          <IconClose size={16} />
        </Button>
      )}
    </header>
  )
}
