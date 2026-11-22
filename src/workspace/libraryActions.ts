import { actingCharacterId, canEdit, getCharacter, systemOf } from "../features/characters/api";
import type { LibraryEntry } from "../features/library";
import type { Campaign } from "../campaign/campaign";
import type { MenuItem } from "../ui/ContextMenu";
import { IconAdd, IconGive  } from "../ui/icons";
import type {Icon} from "../ui/icons";
import { useQuery } from "../ui/useQuery";
import { makeVerb } from "./actionPresentation";
import { useCampaign } from "./campaignContext";
import { acquireItem, npcFromMonster, startMove } from "./commands/characters";
import { can } from "./commands/views";

/** Something the acting character can do with a library entry: get an item, make a move, create an NPC. */
export interface EntryAction {
  label: string;
  Icon: Icon;
  /** Who it is done as, shown after the label on a button. */
  as?: string | undefined;
  disabled: boolean;
  /** Why it can't be done, when it can't. */
  reason?: string | undefined;
  onSelect: () => void;
}

/** What a library entry offers the character this device is playing; one definition for its buttons and its menu. */
export function useLibraryActions(campaign: Campaign) {
  const context = useCampaign();
  const system = systemOf(campaign);
  const meId = useQuery(campaign.members, () => actingCharacterId(campaign));
  const me = useQuery(campaign.characters, () => getCharacter(campaign, meId));
  const canAct = !!me && canEdit(campaign, me);

  const actionsFor = (e: LibraryEntry): EntryAction[] => {
    if (e.kind === "item") {
      const allowed = me
        ? context.commands.check(acquireItem, { characterId: me.id, item: e.item.id })
        : "Choose a character first";
      return [
        {
          label:
            system.acquireItem?.(e.item, me)?.label ??
            (me ? `Give to ${me.name}` : "Choose a Character"),
          Icon: IconGive,
          disabled: allowed !== true,
          reason: allowed === true ? undefined : allowed,
          onSelect: () =>
            me && void context.execute(acquireItem, { characterId: me.id, item: e.item.id }),
        },
      ];
    }
    if (e.kind === "move") {
      const { label, Icon } = makeVerb(e.move);
      return [
        {
          label,
          Icon,
          as: me?.name,
          disabled: !canAct,
          onSelect: () =>
            me && void context.execute(startMove, { characterId: me.id, move: e.move.id }),
        },
      ];
    }
    if (e.kind === "monster")
      return [
        {
          label: "Create NPC",
          Icon: IconAdd,
          disabled: !can(context, npcFromMonster, { monster: e.monster.id }),
          onSelect: () => void context.execute(npcFromMonster, { monster: e.monster.id }),
        },
      ];
    return [];
  };
  return { me, canAct, actionsFor };
}

/** An entry's actions as menu items. */
export const entryActionMenu = (actions: EntryAction[]): MenuItem[] =>
  actions.map(({ label, Icon, disabled, onSelect }) => ({ label, Icon, disabled, onSelect }));
