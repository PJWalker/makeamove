import { signal } from '@preact/signals'
import { until, withTransition } from './ui/transition'

/** Hash routes: `#/` is the lobby, `#/c/<campaignId>` is a campaign. */
function campaignIdFromHash(): string | null {
  const m = location.hash.match(/^#\/c\/([0-9a-z]+)/)
  return m ? m[1] : null
}

export const routeCampaignId = signal<string | null>(campaignIdFromHash())

window.addEventListener('hashchange', () => {
  routeCampaignId.value = campaignIdFromHash()
})

/** Switch between the lobby and a campaign, cross-fading the two pages. */
export function goToCampaign(id: string | null) {
  withTransition(
    async () => {
      location.hash = id ? `#/c/${id}` : '#/'
      await until(() => !!document.querySelector(id ? '.table' : '.lobby'))
    },
    { rootClass: 'vt-page' },
  )
}
