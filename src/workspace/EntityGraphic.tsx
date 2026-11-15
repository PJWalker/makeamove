import { useCallback, useMemo } from "react";
import type { Campaign } from "../campaign/campaign";
import { getCharacter } from "../features/characters/api";
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
  const readGraphic = useCallback(
    () => getEntityGraphic(campaign, kind, id, defaultIcon),
    [campaign, kind, id, defaultIcon],
  );
  const savedGraphic = useQuery(campaign.entityGraphics, readGraphic);
  const readCharacter = useCallback(() => getCharacter(campaign, id) ?? null, [campaign, id]);
  const character = useQuery(kind === "character" ? campaign.characters : null, readCharacter);
  const graphic = useMemo(
    () => (kind === "character" ? getEntityGraphic(campaign, kind, id, defaultIcon) : savedGraphic),
    [campaign, kind, id, defaultIcon, savedGraphic, character],
  );
  return <EntityGraphicView graphic={graphic} size={size} className={className} />;
}
