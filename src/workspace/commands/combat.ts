import { getCharacter, toggleCondition } from "../../features/characters/api";
import type { Duration } from "../../features/characters/types";
import {
  addTokens,
  advanceTurn,
  beginCombat,
  combatantForToken,
  combatMaps,
  endConcentration,
  finishCombat,
  hasCombat,
  rollAllInitiative,
  rollInitiative,
  setDuration,
} from "../../features/combat/api";
import {
  previousTurn,
  removeCombatant,
  roundOf,
  turnOrder,
  updateCombatant
  
} from "../../features/combat/combat";
import type {Combatant} from "../../features/combat/combat";
import { device } from "../../platform/device";
import {
  isBoolean,
  isNothing,
  isNumber,
  isObject,
  isString,
  objectOf,
  optional,
} from "../../lib/guards";
import { GM_ONLY  } from "../../kernel/commands";
import type {Availability} from "../../kernel/commands";
import { IconCombat } from "../../ui/icons";
import type { CampaignContext } from "../campaignContext";
import { command } from "./types";

/* The fight: the GM runs it; players roll their own initiative and look after their own conditions. */

const isId = objectOf({ id: isString });
const combatants = (context: CampaignContext) => turnOrder(context.campaign.combatants);
const running = (context: CampaignContext): Availability =>
  roundOf(combatMaps(context.campaign)) > 0 || "No fight running";
const anyone = (context: CampaignContext): Availability =>
  combatants(context).length > 0 || "No one is in the fight";
const supported = (context: CampaignContext): Availability =>
  hasCombat(context.campaign) || "This game has no initiative";

/** The GM, or the player whose character it is. */
const owns = (context: CampaignContext, characterId: string | undefined): Availability => {
  if (context.isGm()) return true;
  const c = getCharacter(context.campaign, characterId);
  return (!!c && c.owner === device.value.id) || "Not your character";
};
const ownsCombatant = (context: CampaignContext, { id }: { id: string }) =>
  owns(context, context.campaign.combatants.get(id)?.characterId);
const ownsCharacter = (context: CampaignContext, { characterId }: { characterId: string }) =>
  owns(context, characterId);

/** Tokens in the open scene's selection, as combatants. */
function selectedTokens(context: CampaignContext, sceneId: string, ids: string[]) {
  const open = context.canvas.canvasCommands.value;
  if (open?.sceneId !== sceneId) return [];
  return ids.flatMap((id) => {
    const element = open.scene.get(id);
    return element?.type === "token"
      ? [{ id, name: element.name, ...(element.characterId ? { characterId: element.characterId } : {}) }]
      : [];
  });
}

/** The selected tokens that aren't in the fight yet. */
const newToCombat = (context: CampaignContext, sceneId: string, ids: string[]) =>
  selectedTokens(context, sceneId, ids).filter((t) => !combatantForToken(context.campaign, t.id));

export const addToCombat = command<{ sceneId: string; ids: string[] }>({
  id: "combat.addTokens",
  params: objectOf({ sceneId: isString, ids: (v): v is string[] => Array.isArray(v) }),
  title: "Add to Combat",
  icon: IconCombat,
  permission: (context) => {
    const ok = supported(context);
    return ok === true ? context.isGm() || GM_ONLY : ok;
  },
  available: (context, { sceneId, ids }) =>
    newToCombat(context, sceneId, ids).length > 0 || "Already in the fight",
  menu: {
    selection: (context, { sceneId, ids }) =>
      selectedTokens(context, sceneId, ids).length > 0 ? [{ params: { sceneId, ids } }] : [],
  },
  run: (context, { sceneId, ids }) => {
    addTokens(context.campaign, sceneId, newToCombat(context, sceneId, ids));
    context.panels.showPanel("combat");
  },
});

export const startCombat = command({
  id: "combat.start",
  params: isNothing,
  title: "Start Combat",
  permission: "gm",
  available: anyone,
  run: ({ campaign }) => { beginCombat(campaign); },
});

export const nextTurn = command({
  id: "combat.nextTurn",
  params: isNothing,
  title: "Next Turn",
  permission: "gm",
  available: (context) => {
    const fight = running(context);
    return fight === true ? anyone(context) : fight;
  },
  run: ({ campaign }) => { advanceTurn(campaign); },
});

export const previousCombatTurn = command({
  id: "combat.previousTurn",
  params: isNothing,
  title: "Previous Turn",
  permission: "gm",
  available: running,
  run: ({ campaign }) => { previousTurn(combatMaps(campaign)); },
});

export const endCombat = command({
  id: "combat.end",
  params: isNothing,
  title: "End Combat",
  permission: "gm",
  available: running,
  run: ({ campaign }) => { finishCombat(campaign); },
});

export const rollForNpcs = command({
  id: "combat.rollNpcs",
  params: isNothing,
  title: "Roll for NPCs",
  permission: "gm",
  available: (context) => combatants(context).some((c) => c.init === null) || "Everyone has rolled",
  undoGroup: false,
  run: ({ campaign }) => rollAllInitiative(campaign, { npcsOnly: true }),
});

export const rollCombatantInitiative = command<{ id: string }>({
  id: "combatant.rollInitiative",
  params: isId,
  title: "Roll Initiative",
  permission: ownsCombatant,
  undoGroup: false,
  run: ({ campaign }, { id }) => rollInitiative(campaign, id),
});

export const setInitiative = command<{ id: string; init: number | null }>({
  id: "combatant.setInitiative",
  params: objectOf({ id: isString, init: (v): v is number | null => v === null || isNumber(v) }),
  title: "Set Initiative",
  permission: ownsCombatant,
  undoGroup: ({ id }) => `initiative ${id}`,
  run: ({ campaign }, { id, init }) => { updateCombatant(combatMaps(campaign), id, { init }); },
});

export const hideCombatant = command<{ id: string; hidden: boolean }>({
  id: "combatant.setHidden",
  params: objectOf({ id: isString, hidden: isBoolean }),
  title: (_, { hidden }) => (hidden ? "Hide from Players" : "Show to Players"),
  permission: "gm",
  run: ({ campaign }, { id, hidden }) => { updateCombatant(combatMaps(campaign), id, { hidden } satisfies Partial<Combatant>); },
});

export const removeFromCombat = command<{ id: string }>({
  id: "combatant.remove",
  params: isId,
  title: "Remove from Combat",
  permission: "gm",
  run: ({ campaign }, { id }) => { removeCombatant(combatMaps(campaign), id); },
});

/** Give a character a condition for so many rounds, or with no duration, until it's removed. */
export const timeCondition = command<{
  characterId: string;
  condition: string;
  duration?: Duration | undefined;
}>({
  id: "character.timeCondition",
  params: objectOf({
    characterId: isString,
    condition: isString,
    duration: optional((v): v is Duration => isObject(v)),
  }),
  title: "Set Duration",
  permission: ownsCharacter,
  run: ({ campaign }, { characterId, condition, duration }) => {
    if (!getCharacter(campaign, characterId)?.conditions.includes(condition))
      toggleCondition(campaign, characterId, condition);
    setDuration(campaign, characterId, condition, duration ?? null);
  },
});

export const removeTimedCondition = command<{ characterId: string; condition: string }>({
  id: "character.removeTimedCondition",
  params: objectOf({ characterId: isString, condition: isString }),
  title: "Remove Condition",
  permission: ownsCharacter,
  run: ({ campaign }, { characterId, condition }) => {
    if (getCharacter(campaign, characterId)?.conditions.includes(condition))
      toggleCondition(campaign, characterId, condition);
    setDuration(campaign, characterId, condition, null);
  },
});

export const stopConcentrating = command<{ characterId: string }>({
  id: "character.endConcentration",
  params: objectOf({ characterId: isString }),
  title: "End Concentration",
  permission: ownsCharacter,
  run: ({ campaign }, { characterId }) => { endConcentration(campaign, characterId); },
});

export const combatCommands = [
  addToCombat,
  startCombat,
  nextTurn,
  previousCombatTurn,
  endCombat,
  rollForNpcs,
  rollCombatantInitiative,
  setInitiative,
  hideCombatant,
  removeFromCombat,
  timeCondition,
  removeTimedCondition,
  stopConcentrating,
];
