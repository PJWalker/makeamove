import { useQuery } from "../ui/useQuery";
import { useCampaign } from "../workspace/campaignContext";
import { Counter } from "../workspace/sheetParts";
import { bumpData, bumpResource } from "../workspace/commands/characters";
import { canEdit, getCharacter, systemOf } from "../features/characters/api";
import { derive } from "../features/characters/store";
import type { TokenStat } from "../systems/types";

/**
 * What changes about a token's character in play (HP, stress), as its system
 * shows them on the token, to change from the token. Bars hidden from the
 * table only show to those who can change them.
 */
export default function TokenStats({
  characterId,
  hidden,
}: {
  characterId: string;
  hidden: boolean;
}) {
  const context = useCampaign();
  const { campaign } = context;
  const character = useQuery(campaign.characters, () => getCharacter(campaign, characterId));
  if (!character) return null;
  const system = systemOf(campaign);
  const editable = canEdit(campaign, character);
  if (hidden && !editable) return null;
  const change = ({ source, max }: TokenStat, by: number) => {
    const { id } = character;
    if ("resource" in source)
      context.execute(bumpResource, { id, resource: source.resource, by, max });
    else context.execute(bumpData, { id, key: source.data, by, max });
  };
  return system.tokenStats(character, derive(character, system)).map((stat) => (
    <Counter
      key={stat.id}
      label={stat.label}
      value={stat.value}
      max={stat.max}
      disabled={!editable}
      onChange={(by) => {
        change(stat, by);
      }}
    />
  ));
}
