import { signal } from '@preact/signals'
import { useEffect } from 'preact/hooks'
import { startChatNotifications } from './chat/notify'
import { Lobby } from './lobby/Lobby'
import { goToCampaign, routeCampaignId } from './router'
import { activeCampaign, type Campaign, closeCampaign, deleteLocalCampaign, openCampaign } from './store/campaign'
import { Button } from './ui/Button'
import { Tooltip } from './ui/Tooltip'
import { lazy, Suspense } from 'preact/compat'

// The table (rich text, rules, panels) loads when a campaign opens, so the lobby comes up quickly.
const Tabletop = lazy(() => import('./table/Tabletop').then((m) => ({ default: m.Tabletop })))

const openError = signal<string | null>(null)

export function App() {
  const id = routeCampaignId.value

  useEffect(() => startChatNotifications(), [])

  useEffect(() => {
    if (!id) {
      closeCampaign()
      return
    }
    openError.value = null
    openCampaign(id).catch((e) => {
      openError.value = `Couldn't open that campaign: ${e}`
      goToCampaign(null)
    })
  }, [id])

  return (
    <>
      <Screen id={id} />
      <Tooltip />
    </>
  )
}

function Screen({ id }: { id: string | null }) {
  const campaign = activeCampaign.value
  if (id && campaign?.id === id) {
    if (campaign.removed.value) return <Removed campaign={campaign} />
    if (!campaign.ready.value) return <Waiting campaign={campaign} />
    return (
      <Suspense fallback={<div class="loading">Opening campaign…</div>}>
        <Tabletop campaign={campaign} />
      </Suspense>
    )
  }
  if (id) return <div class="loading">Opening campaign…</div>
  return <Lobby error={openError.value} />
}

/** Shown to a player the GM removed; their device has left the room. */
function Removed({ campaign }: { campaign: Campaign }) {
  return (
    <main class="loading waiting">
      <p>The GM removed you from {campaign.name}.</p>
      <p class="muted">If they let you back in, open their invite link again to rejoin.</p>
      <div class="form-actions">
        <Button onClick={() => goToCampaign(null)}>Back to the lobby</Button>
        <Button
          variant="danger"
          onClick={async () => {
            await deleteLocalCampaign(campaign.id)
            goToCampaign(null)
          }}
        >
          Delete from this device
        </Button>
      </div>
    </main>
  )
}

/** A joined campaign is empty until the first peer sends it over. */
function Waiting({ campaign }: { campaign: Campaign }) {
  return (
    <main class="loading waiting">
      <p>Waiting for someone from this campaign to come online…</p>
      <p class="muted">{campaign.peerCount.value} connected</p>
      <Button onClick={() => goToCampaign(null)}>Back to the lobby</Button>
    </main>
  )
}
