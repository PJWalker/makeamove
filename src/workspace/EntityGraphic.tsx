import type { Campaign } from "../campaign/campaign";
import type { EntityGraphic } from "../media/images";
import { useQuery } from "../ui/useQuery";
import { EntityGraphicView } from "../ui/EntityGraphic";
import { getEntityGraphic } from "./entityGraphics";

export function CampaignEntityGraphic({
  campaign,
  kind,
  id,
  defaultIcon,
  size = 22,
  className,
}: {
  campaign: Campaign;
  kind: string;
  id: string;
  defaultIcon?: string | undefined;
  size?: number;
  className?: string | undefined;
}) {
  const savedGraphic = useQuery(campaign.entityGraphics, () =>
    JSON.stringify(getEntityGraphic(campaign, kind, id, defaultIcon)),
  );
  useQuery(kind === "character" ? campaign.characters : null, () =>
    JSON.stringify(getEntityGraphic(campaign, kind, id, defaultIcon)),
  );
  const graphic = JSON.parse(savedGraphic) as EntityGraphic;
  return <EntityGraphicView graphic={graphic} size={size} className={className} />;
}
