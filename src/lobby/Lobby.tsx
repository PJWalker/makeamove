import type { ComponentType } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { useSignal } from '@preact/signals'
import { IconAdd, IconCampaign, IconDelete, IconLink } from '../ui/icons'
import { goToCampaign } from '../router'
import { createCampaign, deleteLocalCampaign } from '../store/campaign'
import { device, setDeviceName } from '../store/device'
import { campaigns, registryReady, type CampaignSummary } from '../store/registry'
import { Button } from '../ui/Button'

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

function ago(ts: number): string {
  const mins = Math.round((ts - Date.now()) / 60000)
  if (mins > -60) return relative.format(mins, 'minute')
  const hours = Math.round(mins / 60)
  if (hours > -24) return relative.format(hours, 'hour')
  return relative.format(Math.round(hours / 24), 'day')
}

export function Lobby({ error }: { error: string | null }) {
  const list = campaigns.value

  return (
    <main class="lobby">
      <LazyBackdrop />
      <div class="lobby-inner">
        <header class="lobby-header">
          <h1>Make a Move</h1>
        </header>

        {error && (
          <p class="lobby-error bevel" role="alert">
            {error}
          </p>
        )}

        <section class="panel bevel lobby-section" aria-labelledby="your-campaigns">
          <h2 id="your-campaigns" class="eyebrow">
            Your campaigns
          </h2>
          {!registryReady.value ? null : list.length === 0 ? (
            <div class="empty">
              <IconCampaign size={28} />
              No campaigns yet
            </div>
          ) : (
            <ul class="campaign-list">
              {list.map((c) => (
                <CampaignRow key={c.id} c={c} />
              ))}
            </ul>
          )}
        </section>

        <NewCampaignForm />

        <section class="panel bevel lobby-section lobby-join">
          <h2 class="eyebrow">Join a campaign</h2>
          <Button variant="secondary" disabled label="Available in M2">
            <IconLink size={16} /> Paste invite
          </Button>
        </section>
      </div>
    </main>
  )
}

/** The icon backdrop is decorative and fairly heavy, so it loads after the lobby. */
function LazyBackdrop() {
  const [Backdrop, setBackdrop] = useState<ComponentType | null>(null)
  useEffect(() => {
    import('./IconBackdrop').then((m) => setBackdrop(() => m.IconBackdrop))
  }, [])
  return Backdrop ? <Backdrop /> : null
}

function CampaignRow({ c }: { c: CampaignSummary }) {
  const confirming = useSignal(false)

  return (
    <li class="campaign-row">
      <button type="button" class="campaign-open bevel" onClick={() => goToCampaign(c.id)}>
        <span class="campaign-name">{c.name}</span>
        <span class="campaign-meta">
          {c.role === 'gm' ? 'GM' : 'Player'} · Dungeon World · opened {ago(c.lastOpenedAt)}
        </span>
      </button>
      {confirming.value ? (
        <span class="campaign-confirm">
          <Button variant="danger" size="sm" onClick={() => deleteLocalCampaign(c.id)}>
            Delete from this device
          </Button>
          <Button variant="ghost" size="sm" onClick={() => (confirming.value = false)}>
            Cancel
          </Button>
        </span>
      ) : (
        <Button variant="icon" label={`Delete ${c.name}`} onClick={() => (confirming.value = true)}>
          <IconDelete size={16} />
        </Button>
      )}
    </li>
  )
}

function NewCampaignForm() {
  const name = useSignal('')
  const yourName = useSignal(device.value.name)
  const busy = useSignal(false)

  async function submit(e: Event) {
    e.preventDefault()
    if (!name.value.trim() || !yourName.value.trim()) return
    busy.value = true
    setDeviceName(yourName.value.trim())
    const id = await createCampaign(name.value.trim(), yourName.value.trim())
    busy.value = false
    goToCampaign(id)
  }

  return (
    <form class="panel bevel lobby-section" onSubmit={submit} aria-labelledby="new-campaign">
      <h2 id="new-campaign" class="eyebrow">
        Start a campaign
      </h2>
      <div class="form-row">
        <label class="field">
          Campaign name
          <input
            class="input bevel"
            value={name.value}
            onInput={(e) => (name.value = e.currentTarget.value)}
            placeholder="The Lost Barrows"
            required
          />
        </label>
        <label class="field">
          Your name
          <input
            class="input bevel"
            value={yourName.value}
            onInput={(e) => (yourName.value = e.currentTarget.value)}
            placeholder="Robin"
            autocomplete="nickname"
            required
          />
        </label>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary bevel" disabled={busy.value}>
          <IconAdd size={16} /> Create campaign
        </button>
      </div>
    </form>
  )
}
