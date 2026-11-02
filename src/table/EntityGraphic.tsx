import type { Campaign } from "../store/campaign";
import type { EntityGraphic } from "../graphics";
import { useY } from "../store/useY";
import { EntityGraphicView } from "../ui/EntityGraphic";
import { getEntityGraphic } from "./entityGraphics";

export function CampaignEntityGraphic({
  campaign,
  kind,
  id,
  defaultIcon,
  size = 22,
  className: className,
}: {
  campaign: Campaign;
  kind: string;
  id: string;
  defaultIcon?: string | undefined;
  size?: number;
  className?: string | undefined;
}) {
  const savedGraphic = useY(campaign.entityGraphics, () =>
    JSON.stringify(getEntityGraphic(campaign, kind, id, defaultIcon)),
  );
  useY(kind === "character" ? campaign.characters : null, () =>
    JSON.stringify(getEntityGraphic(campaign, kind, id, defaultIcon)),
  );
  const graphic = JSON.parse(savedGraphic) as EntityGraphic;
  return <EntityGraphicView graphic={graphic} size={size} className={className} />;
}
