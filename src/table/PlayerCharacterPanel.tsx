import type { Campaign } from "../campaign/campaign";
import { getCharacter, playedCharacterId, systemOf } from "../features/characters/api";
import { useY } from "../ui/useY";
import { CharacterSheet } from "./sheets";

/** The sheet of the character this device plays, in a panel of its own. */
export function PlayerCharacterPanel({ campaign }: { campaign: Campaign }) {
  const id = useY(campaign.members, () => playedCharacterId(campaign));
  const c = useY(campaign.characters, () => getCharacter(campaign, id));
  const system = useY(campaign.homebrew, () => systemOf(campaign));
  if (!c) return null;
  return (
    <div className="panel-scroll sheet-panel">
      <CharacterSheet campaign={campaign} system={system} c={c} />
    </div>
  );
}
