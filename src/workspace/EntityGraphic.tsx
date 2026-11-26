import { useCallback } from "react";
import type { Campaign } from "../campaign/campaign";
import { useQuery } from "../ui/useQuery";
import EntityGraphicView from "../ui/EntityGraphic";
import { getEntityGraphic } from "./entityGraphics";

function CampaignEntityGraphic({
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
  const readGraphic = useCallback(
    () => getEntityGraphic(campaign, kind, id, defaultIcon),
    [campaign, kind, id, defaultIcon],
  );
  const savedGraphic = useQuery(campaign.entityGraphics, readGraphic);
  // A character's default graphic also follows the character: its base and creation choices.
  const readCharacterGraphic = useCallback(
    () => (kind === "character" ? getEntityGraphic(campaign, kind, id, defaultIcon) : savedGraphic),
    [campaign, kind, id, defaultIcon, savedGraphic],
  );
  const graphic = useQuery(kind === "character" ? campaign.characters : null, readCharacterGraphic);
  return <EntityGraphicView graphic={graphic} size={size} className={className} />;
}

export default CampaignEntityGraphic;
