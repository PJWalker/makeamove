import type { ComponentType } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { useSignal } from '@preact/signals'
import { IconAdd, IconCampaign, IconDelete, IconLink } from '../ui/icons'
import { goToCampaign, pendingInvite } from '../router'
import { parseInvite } from '../sync/invite'
import { createCampaign, deleteLocalCampaign, joinCampaign } from '../store/campaign'
import { device, setDeviceName } from '../store/device'
import { campaigns, registryReady, type CampaignSummary } from '../store/registry'
import { getSystem, listSystems } from '../systems'
import { Button } from '../ui/Button'

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

function ago(ts: number): string {
  const mins = Math.round((ts - Date.now()) / 60000)
  if (mins > -60) return relative.format(mins, 'minute')
  const hours = Math.round(mins / 60)
  if (hours > -24) return relative.format(hours, 'hour')
  return relative.format(Math.round(hours / 24), 'day')
}

/**
 * The order the list was last shown in. Opening a campaign makes it the most
 * recent, but re-sorting while you're away would move its row, so the zoom
 * back to the list would land somewhere else. The order stays put until the
 * page reloads; new campaigns go on top.
 */
let shownOrder: string[] | null = null

function stableOrder(list: CampaignSummary[]): CampaignSummary[] {
  if (shownOrder) {
    const rank = new Map(shownOrder.map((id, i) => [id, i]))
    list = [...list].sort((a, b) => (rank.get(a.id) ?? -1) - (rank.get(b.id) ?? -1))
  }
  shownOrder = list.map((c) => c.id)
  return list
}

export function Lobby({ error }: { error: string | null }) {
  const list = stableOrder(campaigns.value)

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
              No campaigns yet.
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

        <JoinForm />
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
      <button type="button" class="campaign-open bevel" data-campaign-id={c.id} onClick={() => goToCampaign(c.id)}>
        <span class="campaign-name">{c.name}</span>
        <span class="campaign-meta">
          {c.role === 'gm' ? 'GM' : 'Player'} · {getSystem(c.systemId).name} · opened {ago(c.lastOpenedAt)}
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
  const systemId = useSignal('')
  const busy = useSignal(false)
  const system = listSystems().find((s) => s.id === systemId.value)

  async function submit(e: Event) {
    e.preventDefault()
    if (!name.value.trim() || !yourName.value.trim() || !system) return
    busy.value = true
    setDeviceName(yourName.value.trim())
    const id = await createCampaign(name.value.trim(), yourName.value.trim(), system.id)
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
      <div class="form-row">
        <label class="field">
          System
          <select class="input bevel" value={systemId.value} onChange={(e) => (systemId.value = e.currentTarget.value)} required>
            <option value="" disabled>
              Choose a system
            </option>
            {listSystems().map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div class="form-actions">
        <Button type="submit" variant="primary" disabled={busy.value}>
          <IconAdd size={16} /> Create campaign
        </Button>
      </div>
    </form>
  )
}

function JoinForm() {
  const link = useSignal('')
  const yourName = useSignal(device.value.name)
  const invite = pendingInvite.value ?? parseInvite(link.value)
  const bad = link.value.trim() !== '' && !invite

  function submit(e: Event) {
    e.preventDefault()
    if (!invite || !yourName.value.trim()) return
    setDeviceName(yourName.value.trim())
    const id = joinCampaign(invite)
    pendingInvite.value = null
    link.value = ''
    goToCampaign(id)
  }

  return (
    <form class="panel bevel lobby-section lobby-join" onSubmit={submit} aria-labelledby="join-campaign">
      <h2 id="join-campaign" class="eyebrow">
        Join a campaign
      </h2>
      <div class="form-row">
        {pendingInvite.value ? (
          <p class="field">You've been invited to a campaign.</p>
        ) : (
          <label class="field">
            Invite link
            <input
              class="input bevel"
              value={link.value}
              onInput={(e) => (link.value = e.currentTarget.value)}
              placeholder="Paste an invite link"
              aria-invalid={bad}
            />
          </label>
        )}
        <label class="field">
          Your name
          <input
            class="input bevel"
            value={yourName.value}
            onInput={(e) => (yourName.value = e.currentTarget.value)}
            placeholder="Robin"
            autocomplete="nickname"
          />
        </label>
      </div>
      <div class="form-actions">
        <Button type="submit" disabled={!invite || !yourName.value.trim()}>
          <IconLink size={16} /> Join
        </Button>
      </div>
    </form>
  )
}
