import type { LinkKind } from '../notes/api'
import { linkLabel, linkTip } from '../notes/targets'
import type { Campaign } from '../store/campaign'
import type { WindowProxy } from './CampaignDialogs'
import { dragEntity, entity } from './entityDrag'
import { linkIcon } from './richText'
import { showLink } from './linkState'

/**
 * A link outside the editors (in a chat message): it looks and behaves like
 * one in a note. Its tooltip says what it is; a click opens its pop-up; it
 * can be dragged onto a character, the hotbar or into text.
 */
export function LinkChip({ campaign, kind, id, text }: { campaign: Campaign; kind: LinkKind; id: string; text?: string }) {
  const name = linkLabel(campaign, kind, id)
  if (name === null)
    return (
      <span class="note-link bevel" data-missing="true" data-tip="Not available">
        {text || 'Unavailable'}
      </span>
    )
  const shown = text || name
  return (
    <span
      class="note-link bevel"
      role="link"
      tabIndex={0}
      data-kind={kind}
      data-tip={linkTip(campaign, kind, id) ?? undefined}
      data-tip-long="true"
      data-tip-opens="true"
      onClick={(e) => showLink({ kind, id }, e.currentTarget)}
      onKeyDown={(e) => e.key === 'Enter' && showLink({ kind, id }, e.currentTarget)}
      onPointerDown={(e) => dragEntity(e, entity(campaign, kind, id, shown))}
    >
      {shown}
    </span>
  )
}

/** A window's title-bar icon for a link target, dragging like a link to it. */
export function linkProxy(campaign: Campaign, kind: LinkKind, id: string, label: string, icon?: string): WindowProxy {
  return { Icon: linkIcon({ kind, icon }), entity: entity(campaign, kind, id, label) }
}
