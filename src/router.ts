import { signal } from '@preact/signals'
import { parseInvite, type Invite } from './sync/invite'
import { until, withTransition } from './ui/transition'

/** Hash routes: `#/` is the lobby, `#/c/<campaignId>` is a campaign. */
function campaignIdFromHash(): string | null {
  const m = location.hash.match(/^#\/c\/([0-9a-z]+)/)
  return m ? m[1] : null
}

export const routeCampaignId = signal<string | null>(campaignIdFromHash())

/** An invite link that was opened, waiting for the player to confirm their name. */
export const pendingInvite = signal<Invite | null>(null)

/** Take an invite out of the address bar so the secret doesn't stay in the URL. */
function readHash() {
  const invite = parseInvite(location.hash)
  if (invite) {
    pendingInvite.value = invite
    history.replaceState(null, '', location.pathname + location.search + '#/')
  }
  routeCampaignId.value = campaignIdFromHash()
}

readHash()
window.addEventListener('hashchange', readHash)

/** The campaign's row in the lobby list, if it's on the page. */
const rowOf = (id: string) =>
  document.querySelector<HTMLElement>(`[data-campaign-id="${CSS.escape(id)}"]`)

/** Centre of a rect, for the lobby's zoom to scale around. */
const setZoomOrigin = (r: DOMRect) =>
  document.documentElement.style.setProperty(
    '--zoom-origin',
    `${r.left + r.width / 2}px ${r.top + r.height / 2}px`,
  )

/**
 * Switch between the lobby and a campaign. Opening a campaign zooms the table
 * out of its row in the list: the row and the table share a view-transition
 * name, so the browser morphs one into the other. Leaving shrinks the table
 * back onto the row. The animations themselves live in transitions.css; this
 * only names the row and hands CSS the geometry it needs as variables.
 */
export function goToCampaign(id: string | null) {
  const from = routeCampaignId.value
  const root = document.documentElement
  // Entering: name the row before the old state is captured.
  const row = id ? rowOf(id) : null
  if (row) {
    row.style.viewTransitionName = 'campaign-zoom'
    setZoomOrigin(row.getBoundingClientRect())
  }

  withTransition(
    async () => {
      location.hash = id ? `#/c/${id}` : '#/'
      await until(() => !!document.querySelector(id ? '.table' : '.lobby'))
      const back = !id && from ? rowOf(from) : null
      if (back) {
        // A long list may have the row out of view.
        back.scrollIntoView({ block: 'nearest' })
        const r = back.getBoundingClientRect()
        setZoomOrigin(r)
        root.style.setProperty('--zoom-x', `${r.left}px`)
        root.style.setProperty('--zoom-y', `${r.top}px`)
        root.style.setProperty('--zoom-w', `${r.width}px`)
        root.style.setProperty('--zoom-h', `${r.height}px`)
        root.classList.add('vt-zoom-landing')
      }
    },
    { rootClass: ['vt-zoom', id ? 'vt-zoom-in' : 'vt-zoom-out'] },
  ).then(() => {
    row?.style.removeProperty('view-transition-name')
    for (const v of ['--zoom-origin', '--zoom-x', '--zoom-y', '--zoom-w', '--zoom-h'])
      root.style.removeProperty(v)
    root.classList.remove('vt-zoom-landing')
  })
}
