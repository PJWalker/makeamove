import { IconClose } from '../ui/icons'
import type { ComponentChildren, RefObject } from 'preact'
import type { Campaign } from '../store/campaign'
import { colourOf } from '../scene/presence'
import { device, setDeviceColour, setDeviceName } from '../store/device'
import { useY } from '../store/useY'
import { GRID_TYPES } from '../scene/grid'
import { TOKEN_STYLES } from '../scene/types'
import { Button } from '../ui/Button'
import { Segmented } from '../ui/Segmented'
import { inviteUrl } from '../sync/invite'
import { useSignal } from '@preact/signals'
import { createPortal } from 'preact/compat'
import { dragPopup, raisePopup, resizePopup } from '../ui/popup'
import { autohide, setAutohide } from './canvasState'
import { RESIZE_DIRS } from './resizeRect'
import { dragEntity, type DragEntity } from './entityDrag'
import type { Icon } from '../ui/icons'

/** The icon in a window's title bar that stands for what it shows. */
export interface WindowProxy {
  Icon: Icon
  entity: DragEntity
}
import { windowLayer } from '../ui/windows'

export function Dialog({
  dialogRef,
  title,
  onClose,
  proxy,
  children,
}: {
  dialogRef: RefObject<HTMLDialogElement>
  title: string
  onClose?: () => void
  /**
   * What the window shows, as an icon in its title bar that drags like a
   * link: onto a character, the hotbar, a note or the chat.
   */
  proxy?: WindowProxy
  children: ComponentChildren
}) {
  // Rendered in the window layer with the other windows: a non-modal dialog
  // would otherwise be clipped by the panel that opened it (the scene bar
  // clips its contents).
  return createPortal(
    <dialog
      ref={dialogRef}
      class="dialog window panel bevel"
      closedby="none"
      aria-label={title}
      onClose={onClose}
      onPointerDown={(e) => raisePopup(e.currentTarget)}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !e.defaultPrevented) {
          e.preventDefault()
          e.currentTarget.close()
        }
      }}
    >
      <header class="panel-header window-header" onPointerDown={(e) => dragPopup(dialogRef.current!, e)}>
        {proxy && (
          <span
            class="window-proxy"
            data-tip="Drag to link it, or onto a character or the hotbar"
            onPointerDown={(e) => {
              // Not a drag of the window itself.
              e.stopPropagation()
              dragEntity(e, proxy.entity, e.currentTarget.nextElementSibling as HTMLElement)
            }}
          >
            <proxy.Icon size={16} />
          </span>
        )}
        <h2 class="panel-title">{title}</h2>
        <Button variant="icon" label="Close" onClick={() => dialogRef.current?.close()}>
          <IconClose size={16} />
        </Button>
      </header>
      <div class="dialog-body">{children}</div>
      <span class="resize-grip" aria-hidden="true" />
      {RESIZE_DIRS.map((dir) => (
        <span
          key={dir}
          class="win-resize"
          data-dir={dir}
          aria-hidden="true"
          onPointerDown={(e) => resizePopup(dialogRef.current!, e, dir)}
        />
      ))}
    </dialog>,
    windowLayer,
  )
}

/** Everything you can set: for you on this device, and (for the GM) for the campaign. */
export function SettingsDialog({
  campaign,
  dialogRef,
}: {
  campaign: Campaign
  dialogRef: RefObject<HTMLDialogElement>
}) {
  const myName = useY(campaign.members, () => campaign.members.get(device.value.id)?.get('name') ?? '')
  const colour = colourOf(device.value)
  return (
    <Dialog dialogRef={dialogRef} title="Settings">
      <section class="dialog-section">
        <h3 class="dialog-heading">You</h3>
        <label class="field">
          Your name
          <input
            class="input bevel"
            value={myName}
            onChange={(e) => {
              const v = e.currentTarget.value.trim()
              if (!v) return
              setDeviceName(v)
              campaign.ensureMember(v)
            }}
          />
        </label>
        <label class="field">
          Your colour
          <input
            type="color"
            class="input bevel"
            value={colour}
            onInput={(e) => setDeviceColour(e.currentTarget.value)}
            aria-label="Your colour"
          />
        </label>
        <p class="muted">Your colour marks your cursor and pings, and is used for tokens you create.</p>
        <div class="field">
          Sidebars and toolbars
          <Segmented
            label="Sidebars and toolbars"
            value={autohide.value ? 'autohide' : 'always'}
            options={[
              { id: 'always', label: 'Always shown' },
              { id: 'autohide', label: 'Autohide' },
            ]}
            onChange={(v) => setAutohide(v === 'autohide')}
          />
          <span class="muted">Autohide keeps them out of sight until your pointer nears their edge of the window.</span>
        </div>
      </section>
      {campaign.isGm() && <CampaignSettings campaign={campaign} />}
    </Dialog>
  )
}

function CampaignSettings({ campaign }: { campaign: Campaign }) {
  const name = useY(campaign.meta, () => campaign.name)
  const defaults = useY(campaign.meta, () => campaign.defaults())
  return (
    <section class="dialog-section">
      <h3 class="dialog-heading">Campaign</h3>
      <label class="field">
        Campaign name
        <input
          class="input bevel"
          value={name}
          onChange={(e) => {
            const v = e.currentTarget.value.trim()
            if (v) campaign.rename(v)
          }}
        />
      </label>
      <div class="field">
        Game system
        <span class="dialog-value">Dungeon World</span>
      </div>
      <div class="field">
        New tokens
        <Segmented
          label="Default token style"
          value={defaults.tokenStyle}
          options={TOKEN_STYLES}
          onChange={(tokenStyle) => campaign.setDefaults({ tokenStyle })}
        />
      </div>
      <div class="field">
        Grid for new scenes
        <Segmented
          label="Default grid"
          value={defaults.gridType}
          options={GRID_TYPES}
          onChange={(gridType) => campaign.setDefaults({ gridType })}
        />
      </div>
      <InviteField campaign={campaign} />
    </section>
  )
}

const SHORTCUTS: [string, string][] = [
  ['V', 'Select'],
  ['H', 'Pan'],
  ['P', 'Draw'],
  ['R', 'Shapes'],
  ['T', 'Text'],
  ['M', 'Measure'],
  ['G', 'Ping'],
  ['E', 'Erase drawings'],
  ['Space + drag', 'Pan the map'],
  ['Scroll / pinch', 'Zoom (trackpads: two fingers pan)'],
  ['⇧1', 'Fit the scene'],
  ['⇧0', 'Zoom to 100%'],
  ['Ctrl/⌘ + Z', 'Undo your last change'],
  ['Ctrl/⌘ + ⇧Z', 'Redo'],
  ['Ctrl/⌘ + D', 'Duplicate'],
  ['Delete', 'Delete the selection'],
  ['Arrows', 'Nudge (⇧ for a whole cell)'],
  ['Alt + drag', 'Move a token off the grid'],
  ['Ctrl/⌘ + \\', 'Autohide sidebars and toolbars'],
  ['Ctrl/⌘ + K', 'Search moves, tools, scenes and commands'],
]

export function HelpDialog({ dialogRef }: { dialogRef: RefObject<HTMLDialogElement> }) {
  return (
    <Dialog dialogRef={dialogRef} title="Help">
      <section class="dialog-section">
        <h3 class="dialog-heading">Keyboard shortcuts</h3>
        <dl class="shortcuts">
          {SHORTCUTS.map(([key, action]) => (
            <div key={key} class="shortcut">
              <dt>
                <kbd class="bevel">{key}</kbd>
              </dt>
              <dd>{action}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section class="dialog-section">
        <h3 class="dialog-heading">Maps and tokens</h3>
        <p class="muted">
          Drop or paste images onto the canvas. Small, square images become tokens; anything bigger is placed as a
          map. Double-click a token to rename or restyle it; right-click anything to lock it, restack it or swap it between map and token. Undo only ever
          reverts your own changes.
        </p>
      </section>
      <section class="dialog-section">
        <h3 class="dialog-heading">Panels</h3>
        <p class="muted">
          Drag a sidebar tab, or a docked panel’s title, out onto the map to open it in its own window. Drag the
          window onto the left or right sidebar to dock it there, or use its dock button to put it back. Right-click a tab to
          move it to the other sidebar.
        </p>
      </section>
      <section class="dialog-section">
        <h3 class="dialog-heading">Credits</h3>
        <p class="muted">
          Icons by Lorc, Delapouite and contributors at{' '}
          <a href="https://game-icons.net" target="_blank" rel="noreferrer">
            game-icons.net
          </a>{' '}
          (CC BY 3.0), and{' '}
          <a href="https://fonts.google.com/icons" target="_blank" rel="noreferrer">
            Material Symbols
          </a>{' '}
          (Apache 2.0).
        </p>
      </section>
    </Dialog>
  )
}

function InviteField({ campaign }: { campaign: Campaign }) {
  const copied = useSignal(false)
  const roomKey = useY(campaign.meta, () => campaign.meta.get('roomKey') as string | undefined)
  if (!roomKey) return null
  const url = inviteUrl({ campaignId: campaign.id, roomKey })
  return (
    <div class="field">
      Invite link
      <div class="form-row">
        <input class="input bevel" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
        <Button
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(url)
            copied.value = true
            setTimeout(() => (copied.value = false), 1500)
          }}
        >
          {copied.value ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <span class="muted">Anyone with this link can join. Keep it private.</span>
    </div>
  )
}
