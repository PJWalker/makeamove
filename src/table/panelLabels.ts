import type { Campaign } from "../campaign/campaign";
import { getCharacter, playedCharacterId } from "../features/characters/api";
import { isPanelId, PANELS, type DockItemId, type PanelId } from "../workspace/panelLayout";
import { useQuery } from "../ui/useQuery";

export function usePanelLabel(id: PanelId, campaign: Campaign): string;
export function usePanelLabel(id: DockItemId, campaign: Campaign): string | undefined;
export function usePanelLabel(id: DockItemId, campaign: Campaign) {
  const played = useQuery(campaign.members, () =>
    id === "pc" ? playedCharacterId(campaign) : undefined,
  );
  const name = useQuery(campaign.characters, () => getCharacter(campaign, played)?.name);
  return name ?? (isPanelId(id) ? PANELS[id].label : undefined);
}
