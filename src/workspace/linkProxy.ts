import type { LinkKind } from "../features/notes/links";
import type { WindowProxy } from "./entityWindowState";
import { entity } from "./dragEntities";
import type { CampaignContext } from "./campaignContext";

/** A window's title-bar icon for a link target, dragging like a link to it. */
export function linkProxy(
  ctx: CampaignContext,
  kind: LinkKind,
  id: string,
  label: string,
  icon?: string,
): WindowProxy {
  return {
    campaign: ctx.campaign,
    kind,
    id,
    defaultIcon: icon,
    entity: entity(ctx, kind, id, label),
  };
}
