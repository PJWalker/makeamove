import { signal } from '@preact/signals'
import { useEffect } from 'preact/hooks'
import { Lobby } from './lobby/Lobby'
import { goToCampaign, routeCampaignId } from './router'
import { activeCampaign, closeCampaign, openCampaign } from './store/campaign'
import { Tabletop } from './table/Tabletop'

const openError = signal<string | null>(null)

export function App() {
  const id = routeCampaignId.value

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

  const campaign = activeCampaign.value
  if (id && campaign?.id === id) return <Tabletop campaign={campaign} />
  if (id) return <div class="loading">Opening campaign…</div>
  return <Lobby error={openError.value} />
}
