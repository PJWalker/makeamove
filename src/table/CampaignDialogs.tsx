import { IconClose } from '../ui/icons'
import type { ComponentChildren, RefObject } from 'preact'
import type { Campaign } from '../store/campaign'
import { device, setDeviceName } from '../store/device'
import { useY } from '../store/useY'
import { Button } from '../ui/Button'

function Dialog({
  dialogRef,
  title,
  children,
}: {
  dialogRef: RefObject<HTMLDialogElement>
  title: string
  children: ComponentChildren
}) {
  return (
    <dialog ref={dialogRef} class="dialog panel bevel" closedby="any" aria-label={title}>
      <header class="panel-header">
        <h2 class="panel-title">{title}</h2>
        <Button variant="icon" label="Close" onClick={() => dialogRef.current?.close()}>
          <IconClose size={16} />
        </Button>
      </header>
      <div class="dialog-body">{children}</div>
    </dialog>
  )
}

export function SettingsDialog({
  campaign,
  dialogRef,
}: {
  campaign: Campaign
  dialogRef: RefObject<HTMLDialogElement>
}) {
  const name = useY(campaign.meta, () => campaign.name)
  const myName = useY(campaign.members, () => campaign.members.get(device.value.id)?.get('name') ?? '')
  const isGm = campaign.isGm()

  return (
    <Dialog dialogRef={dialogRef} title="Campaign settings">
      <label class="field">
        Campaign name
        <input
          class="input bevel"
          value={name}
          readOnly={!isGm}
          onChange={(e) => {
            const v = e.currentTarget.value.trim()
            if (v) campaign.rename(v)
          }}
        />
      </label>
      <label class="field">
        Your name at this table
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
      <div class="field">
        Game system
        <span class="dialog-value">Dungeon World</span>
      </div>
      {!isGm && <p class="muted">Only the GM can rename the campaign.</p>}
    </Dialog>
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
  ['F', 'Fog of war (GM)'],
  ['Ctrl/⌘ + \\', 'Hide or show all panels'],
]

export function HelpDialog({ dialogRef }: { dialogRef: RefObject<HTMLDialogElement> }) {
  return (
    <Dialog dialogRef={dialogRef} title="Help">
      <section class="help-section">
        <h3 class="help-heading">Keyboard shortcuts</h3>
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
      <section class="help-section">
        <h3 class="help-heading">Panels</h3>
        <p class="muted">
          Drag a sidebar tab, or a docked panel’s title, out onto the map to open it in its own window. Drag the
          window back onto the sidebar, or use its dock button, to put it back.
        </p>
      </section>
      <section class="help-section">
        <h3 class="help-heading">Credits</h3>
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
