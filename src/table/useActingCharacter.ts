import type { Campaign } from "../campaign/campaign";
import { actingCharacterId, canEdit, getCharacter } from "../features/characters/api";
import { useQuery } from "../ui/useQuery";

/** The character this device acts as, and whether it may change them: gear and moves go to them. */
function useActingCharacter(campaign: Campaign) {
  const meId = useQuery(campaign.members, () => actingCharacterId(campaign));
  const me = useQuery(campaign.characters, () => getCharacter(campaign, meId));
  return { me, canAct: !!me && canEdit(campaign, me) };
}

export default useActingCharacter;
