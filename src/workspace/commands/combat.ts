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
  updateCombatant,
  type Combatant,
} from "../../features/combat/combat";
import { device } from "../../platform/device";
import {
  isBoolean,
  isNothing,
  isNumber,
  isObject,
  isString,
  objectOf,
  optional,
} from "../../data/guards";
import { GM_ONLY, type Availability } from "../../kernel/commands";
import { IconCombat } from "../../ui/icons";
import type { CampaignContext } from "../campaignContext";
import { command } from "./types";

/* The fight: the GM runs it; players roll their own initiative and look after their own conditions. */

const isId = objectOf({ id: isString });
const combatants = (ctx: CampaignContext) => turnOrder(ctx.campaign.combatants);
const running = (ctx: CampaignContext): Availability =>
  roundOf(combatMaps(ctx.campaign)) > 0 || "No fight running";
const anyone = (ctx: CampaignContext): Availability =>
  combatants(ctx).length > 0 || "No one is in the fight";
const supported = (ctx: CampaignContext): Availability =>
  hasCombat(ctx.campaign) || "This game has no initiative";

/** The GM, or the player whose character it is. */
const owns = (ctx: CampaignContext, characterId: string | undefined): Availability => {
  if (ctx.isGm()) return true;
  const c = getCharacter(ctx.campaign, characterId);
  return (!!c && c.owner === device.value.id) || "Not your character";
};
const ownsCombatant = (ctx: CampaignContext, { id }: { id: string }) =>
  owns(ctx, ctx.campaign.combatants.get(id)?.characterId);

/** Tokens in the open scene's selection, as combatants. */
function selectedTokens(ctx: CampaignContext, sceneId: string, ids: string[]) {
  const open = ctx.canvas.canvasCommands.value;
  if (open?.sceneId !== sceneId) return [];
  return ids.flatMap((id) => {
    const el = open.scene.get(id);
    return el?.type === "token"
      ? [{ id, name: el.name, ...(el.characterId ? { characterId: el.characterId } : {}) }]
      : [];
  });
}

export const addToCombat = command<{ sceneId: string; ids: string[] }>({
  id: "combat.addTokens",
  params: objectOf({ sceneId: isString, ids: (v): v is string[] => Array.isArray(v) }),
  title: "Add to Combat",
  icon: IconCombat,
  permission: (ctx) => {
    const ok = supported(ctx);
    return ok !== true ? ok : ctx.isGm() || GM_ONLY;
  },
  available: (ctx, { sceneId, ids }) =>
    selectedTokens(ctx, sceneId, ids).some((t) => !combatantForToken(ctx.campaign, t.id)) ||
    "Already in the fight",
  menu: {
    selection: (ctx, { sceneId, ids }) =>
      selectedTokens(ctx, sceneId, ids).length ? [{ params: { sceneId, ids } }] : [],
  },
  run: (ctx, { sceneId, ids }) => {
    const out = selectedTokens(ctx, sceneId, ids).filter(
      (t) => !combatantForToken(ctx.campaign, t.id),
    );
    addTokens(ctx.campaign, sceneId, out);
    ctx.panels.showPanel("combat");
  },
});

export const startCombat = command({
  id: "combat.start",
  params: isNothing,
  title: "Start Combat",
  permission: "gm",
  available: anyone,
  run: ({ campaign }) => beginCombat(campaign),
});

export const nextTurn = command({
  id: "combat.nextTurn",
  params: isNothing,
  title: "Next Turn",
  permission: "gm",
  available: (ctx) => (running(ctx) === true ? anyone(ctx) : running(ctx)),
  run: ({ campaign }) => advanceTurn(campaign),
});

export const previousCombatTurn = command({
  id: "combat.previousTurn",
  params: isNothing,
  title: "Previous Turn",
  permission: "gm",
  available: running,
  run: ({ campaign }) => previousTurn(combatMaps(campaign)),
});

export const endCombat = command({
  id: "combat.end",
  params: isNothing,
  title: "End Combat",
  permission: "gm",
  available: running,
  run: ({ campaign }) => finishCombat(campaign),
});

export const rollForNpcs = command({
  id: "combat.rollNpcs",
  params: isNothing,
  title: "Roll for NPCs",
  permission: "gm",
  available: (ctx) => combatants(ctx).some((c) => c.init === null) || "Everyone has rolled",
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
  run: ({ campaign }, { id, init }) => updateCombatant(combatMaps(campaign), id, { init }),
});

export const hideCombatant = command<{ id: string; hidden: boolean }>({
  id: "combatant.setHidden",
  params: objectOf({ id: isString, hidden: isBoolean }),
  title: (_, { hidden }) => (hidden ? "Hide from Players" : "Show to Players"),
  permission: "gm",
  run: ({ campaign }, { id, hidden }) =>
    updateCombatant(combatMaps(campaign), id, { hidden } satisfies Partial<Combatant>),
});

export const removeFromCombat = command<{ id: string }>({
  id: "combatant.remove",
  params: isId,
  title: "Remove from Combat",
  permission: "gm",
  run: ({ campaign }, { id }) => removeCombatant(combatMaps(campaign), id),
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
  permission: (ctx, { characterId }) => owns(ctx, characterId),
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
  permission: (ctx, { characterId }) => owns(ctx, characterId),
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
  permission: (ctx, { characterId }) => owns(ctx, characterId),
  run: ({ campaign }, { characterId }) => endConcentration(campaign, characterId),
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
