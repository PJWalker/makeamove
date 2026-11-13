import {
  actingCharacterId,
  addItem as addItemTo,
  applySuggestion as applyMoveSuggestion,
  bumpData as bumpCharacterData,
  bumpResource as bumpCharacterResource,
  canClaim,
  canEdit,
  claimCharacter,
  clearArtifactTrack,
  createCopy,
  createFolder,
  deleteCharacter as removeCharacter,
  deleteFolder,
  getCharacter,
  listCharacters,
  listFolders,
  makeMove as rollMove,
  markArtifactTrack,
  moveToFolder,
  newCharacter as createCharacter,
  newNpc as createNpc,
  newNpcFromMonster,
  playedCharacterId,
  releaseCharacter,
  removeItem as removeItemFrom,
  renameFolder,
  resetCopy as resetCharacterCopy,
  rest as restCharacter,
  setConditionState as setCharacterCondition,
  setData as setCharacterData,
  setField as setCharacterField,
  setLearned as setCharacterLearned,
  setLoadout as setCharacterLoadout,
  setModifier as setCharacterModifier,
  setNpcField as setCharacterNpcField,
  setResource as setCharacterResource,
  setScore as setCharacterScore,
  setTemplate as setCharacterTemplate,
  spendItemUse,
  startMove as beginMove,
  systemOf,
  toggleCondition as toggleCharacterCondition,
  updateItem as updateCharacterItem,
  viewCharacter,
} from "../../features/characters/api";
import { SLOT_COMMANDS } from "../../features/characters/hotbar";
import { pressTracker } from "../../features/characters/trackers";
import { answerSave, applyDamage, canAnswer } from "../../features/characters/resolution";
import {
  removeRelationship as unrelate,
  setRelationship as relate,
  setRelationshipDepth as setDepth,
} from "../../features/characters/relationships";
import type { ConditionState, CoreField } from "../../features/characters/sheet";
import { sessionMoveUsed } from "../../features/characters/sessionMoves";
import { actionsFor, derive } from "../../features/characters/store";
import type { ItemInstance, TemplateSettings } from "../../features/characters/types";
import type { MoveChoice } from "../../features/characters/moves";
import type { MoveSuggestion, MoveTarget, SaveRequest } from "../../features/chat/types";
import type { TrackerButton } from "../../data/richText";
import type { DataValue } from "../../data/types";
import { commaListOf } from "../../lib/list";
import {
  arrayOf,
  isBoolean,
  isNumber,
  isObject,
  isString,
  objectOf,
  oneOf,
  optional,
} from "../../data/guards";
import type { Availability } from "../../kernel/commands";
import type { ActionDef, ItemDef, ResetEvent } from "../../systems/types";
import { IconDelete, IconFolder, IconImage } from "../../ui/icons";
import type { CampaignContext } from "../campaignContext";
import { folderCommands } from "./folders";
import { command, type TableCommand } from "./types";

/* Characters: making, playing, filing and changing them, their moves and their gear. */

const isId = objectOf({ id: isString });
const isValue = (v: unknown): v is DataValue => isString(v) || isNumber(v) || isBoolean(v);
const isPlain = <T extends object>(v: unknown): v is T => isObject<T>(v);

/** Only a character's player, or the GM, changes it. */
export const editable = (ctx: CampaignContext, id: string | undefined): Availability => {
  const c = getCharacter(ctx.campaign, id);
  if (!c) return id ? "That character is gone" : "Choose a character first";
  return canEdit(ctx.campaign, c) || "Not your character";
};
const mayEdit = (ctx: CampaignContext, { id }: { id: string }) => editable(ctx, id);
/** For calls about the acting character unless they name one. */
const actor = (ctx: CampaignContext, characterId: string | undefined) =>
  characterId ?? actingCharacterId(ctx.campaign);

/**
 * A change to one character, as a command: only their player or the GM
 * makes it. Game systems declare their own with this.
 */
export const characterCommand = <P extends { characterId: string }, R = unknown>(
  spec: Omit<TableCommand<P, R>, "permission">,
): TableCommand<P, R> =>
  command<P, R>({ ...spec, permission: (ctx, p) => editable(ctx, p.characterId) });

// Finding, playing and filing

export const openCharacter = command<{ id: string }>({
  id: "character.open",
  params: isId,
  kind: "entry",
  title: (ctx, { id }) => getCharacter(ctx.campaign, id)?.name ?? "Character",
  detail: (ctx, { id }) => (getCharacter(ctx.campaign, id)?.kind === "npc" ? "NPC" : "Character"),
  source: "Characters",
  section: "open",
  transact: false,
  available: (ctx, { id }) => !!getCharacter(ctx.campaign, id) || "That character is gone",
  offers: (ctx) =>
    listCharacters(ctx.campaign).map((c) => ({
      params: { id: c.id },
      group: "character" as const,
    })),
  menu: { character: (_, { id }) => [{ params: { id }, title: "Open Character" }] },
  run: (ctx, { id }) => ctx.links.openCharacter(id),
});

/** Show a character in the Characters panel (or none); where this player is looking, not an edit. */
export const viewSheet = command<{ id?: string | undefined }>({
  id: "character.view",
  params: objectOf({ id: optional(isString) }),
  title: "Show Character",
  undoGroup: false,
  run: ({ campaign }, { id }) => viewCharacter(campaign, id),
});

export const claim = command<{ id: string }>({
  id: "character.claim",
  params: isId,
  title: "Play This Character",
  section: "play",
  undoGroup: false,
  permission: (ctx, { id }) => {
    const c = getCharacter(ctx.campaign, id);
    return (!!c && canClaim(ctx.campaign, c)) || "Someone else plays them";
  },
  menu: {
    character: (ctx, { id }) =>
      playedCharacterId(ctx.campaign) === id ? [] : [{ params: { id } }],
  },
  run: ({ campaign }, { id }) => claimCharacter(campaign, id),
});

export const release = command<{ id: string }>({
  id: "character.release",
  params: isId,
  title: "Stop Playing",
  section: "play",
  undoGroup: false,
  permission: (ctx, { id }) => playedCharacterId(ctx.campaign) === id || "You don’t play them",
  menu: { character: (_, { id }) => [{ params: { id } }] },
  run: ({ campaign }) => releaseCharacter(campaign),
});

export const fileCharacter = command<{ id: string; folder?: string | undefined }>({
  id: "character.moveToFolder",
  params: objectOf({ id: isString, folder: optional(isString) }),
  title: "Move to Folder",
  icon: IconFolder,
  section: "file",
  permission: mayEdit,
  menu: {
    character: (ctx, { id }) => {
      const c = getCharacter(ctx.campaign, id);
      const folders = listFolders(ctx.campaign);
      return [
        ...folders
          .filter((f) => f.id !== c?.folder)
          .map((f) => ({ params: { id, folder: f.id }, title: `Move to ${f.name}` })),
        ...(c?.folder && folders.some((f) => f.id === c.folder)
          ? [{ params: { id }, title: "Remove from Folder" }]
          : []),
      ];
    },
  },
  run: ({ campaign }, { id, folder }) => moveToFolder(campaign, id, folder),
});

export const changeCharacterGraphic = command<{ id: string }>({
  id: "character.changeGraphic",
  params: isId,
  title: "Change Graphic…",
  icon: IconImage,
  section: "edit",
  transact: false,
  permission: mayEdit,
  menu: { character: (_, { id }) => [{ params: { id } }] },
  run: (ctx, { id }) =>
    ctx.table.editGraphic("character", id, getCharacter(ctx.campaign, id)?.name ?? ""),
});

export const deleteCharacter = command<{ id: string }>({
  id: "character.delete",
  params: isId,
  title: "Delete Character…",
  icon: IconDelete,
  danger: true,
  section: "delete",
  permission: mayEdit,
  confirm: (ctx, { id }) => {
    const name = getCharacter(ctx.campaign, id)?.name ?? "this character";
    return {
      title: "Delete character",
      body: `Delete ${name}? Their sheet is gone for everyone, and tokens on the map stop being linked to them.`,
      subject: name,
      confirmLabel: "Delete",
      danger: true,
    };
  },
  menu: { character: (_, { id }) => [{ params: { id } }] },
  run: ({ campaign }, { id }) => removeCharacter(campaign, id),
});

// Making characters

type Made = { scores: Record<string, number>; data: Record<string, DataValue> } | undefined;

/**
 * Make a player character from the creation form, as one step: the
 * character, its starting gear, its first relationship and its folder.
 */
export const newCharacter = command<
  {
    name: string;
    classId: string;
    made?: Made;
    folder?: string | undefined;
    relationship?: { to: string; label: string; depth: number } | undefined;
  },
  string
>({
  id: "character.create",
  params: objectOf({
    name: isString,
    classId: isString,
    made: optional(isPlain<NonNullable<Made>>),
    folder: optional(isString),
    relationship: optional(isPlain<{ to: string; label: string; depth: number }>),
  }),
  title: "New Character",
  run: ({ campaign }, { name, classId, made, folder, relationship }) => {
    const system = systemOf(campaign);
    const id = createCharacter(campaign, name, classId, made);
    const startingItems = system.creation?.startingItemsField;
    if (startingItems && made) {
      const itemsById = new Map<string, (typeof system.items)[number]>();
      for (const item of system.items) if (!itemsById.has(item.id)) itemsById.set(item.id, item);
      for (const itemId of commaListOf(made.data[startingItems])) {
        const item = itemsById.get(itemId);
        if (item) addItemTo(campaign, id, item, !!item.equippable);
      }
    }
    if (relationship) {
      relate(campaign.characters, id, relationship.to, relationship.label.trim());
      setDepth(
        campaign.characters,
        id,
        relationship.to,
        relationship.depth,
        system.relationshipDepth?.max ?? 0,
      );
    }
    if (folder) moveToFolder(campaign, id, folder);
    return id;
  },
});

export const newNpc = command<{ name?: string | undefined; folder?: string | undefined }, string>({
  id: "character.createNpc",
  params: objectOf({ name: optional(isString), folder: optional(isString) }),
  title: "New NPC",
  permission: "gm",
  run: ({ campaign }, { name, folder }) => createNpc(campaign, name ?? "", folder),
});

export const npcFromMonster = command<{ monster: string }, string | undefined>({
  id: "character.createFromMonster",
  params: objectOf({ monster: isString }),
  title: "New NPC from Monster",
  permission: "gm",
  run: ({ campaign }, { monster }) => newNpcFromMonster(campaign, monster),
});

export const copyCharacter = command<{ template: string; name: string }, string>({
  id: "character.copy",
  params: objectOf({ template: isString, name: isString }),
  title: "Copy Character",
  run: ({ campaign }, { template, name }) => createCopy(campaign, template, name),
});

export const resetCopy = command<{ id: string }>({
  id: "character.resetCopy",
  params: isId,
  title: "Reset Copy",
  permission: mayEdit,
  run: ({ campaign }, { id }) => resetCharacterCopy(campaign, id),
});

export const setTemplate = command<{ id: string; settings: TemplateSettings | null }>({
  id: "character.setTemplate",
  params: objectOf({
    id: isString,
    settings: (v): v is TemplateSettings | null => v === null || isObject(v),
  }),
  title: "Make Template",
  permission: mayEdit,
  run: ({ campaign }, { id, settings }) => setCharacterTemplate(campaign, id, settings),
});

// The sheet. Changes to one field in quick succession (typing, clicking +) are one undo step.

export const setField = command<{ id: string; key: CoreField; value: unknown }>({
  id: "character.setField",
  params: objectOf({ id: isString, key: isString }) as never,
  title: "Change Character",
  permission: mayEdit,
  undoGroup: ({ id, key }) => `field ${id} ${key}`,
  run: ({ campaign }, { id, key, value }) =>
    setCharacterField(campaign, id, key, value as Parameters<typeof setCharacterField>[3]),
});

export const setData = command<{ id: string; key: string; value: DataValue }>({
  id: "character.setData",
  params: objectOf({ id: isString, key: isString, value: isValue }),
  title: "Change Character",
  permission: mayEdit,
  undoGroup: ({ id, key }) => `data ${id} ${key}`,
  run: ({ campaign }, { id, key, value }) => setCharacterData(campaign, id, key, value),
});

export const bumpData = command<{ id: string; key: string; by: number; max?: number | undefined }>({
  id: "character.bumpData",
  params: objectOf({ id: isString, key: isString, by: isNumber, max: optional(isNumber) }),
  title: "Change Character",
  permission: mayEdit,
  undoGroup: ({ id, key }) => `data ${id} ${key}`,
  run: ({ campaign }, { id, key, by, max }) => bumpCharacterData(campaign, id, key, by, max),
});

export const setScore = command<{ id: string; stat: string; score: number }>({
  id: "character.setScore",
  params: objectOf({ id: isString, stat: isString, score: isNumber }),
  title: "Change Score",
  permission: mayEdit,
  undoGroup: ({ id, stat }) => `score ${id} ${stat}`,
  run: ({ campaign }, { id, stat, score }) => setCharacterScore(campaign, id, stat, score),
});

export const setResource = command<{ id: string; resource: string; value: number }>({
  id: "character.setResource",
  params: objectOf({ id: isString, resource: isString, value: isNumber }),
  title: "Change Resource",
  permission: mayEdit,
  undoGroup: ({ id, resource }) => `resource ${id} ${resource}`,
  run: ({ campaign }, { id, resource, value }) =>
    setCharacterResource(campaign, id, resource, value),
});

export const bumpResource = command<{
  id: string;
  resource: string;
  by: number;
  max?: number | undefined;
}>({
  id: "character.bumpResource",
  params: objectOf({ id: isString, resource: isString, by: isNumber, max: optional(isNumber) }),
  title: "Change Resource",
  permission: mayEdit,
  undoGroup: ({ id, resource }) => `resource ${id} ${resource}`,
  run: ({ campaign }, { id, resource, by, max }) =>
    bumpCharacterResource(campaign, id, resource, by, max),
});

export const setModifier = command<{ id: string; modifier: string; value: number }>({
  id: "character.setModifier",
  params: objectOf({ id: isString, modifier: isString, value: isNumber }),
  title: "Change Modifier",
  permission: mayEdit,
  undoGroup: ({ id, modifier }) => `modifier ${id} ${modifier}`,
  run: ({ campaign }, { id, modifier, value }) =>
    setCharacterModifier(campaign, id, modifier, value),
});

export const setNpcField = command<{ id: string; field: string; value: string | number }>({
  id: "character.setNpcField",
  params: objectOf({
    id: isString,
    field: isString,
    value: (v): v is string | number => isString(v) || isNumber(v),
  }),
  title: "Change NPC",
  permission: mayEdit,
  undoGroup: ({ id, field }) => `npc ${id} ${field}`,
  run: ({ campaign }, { id, field, value }) => setCharacterNpcField(campaign, id, field, value),
});

export const toggleCondition = command<{ id: string; condition: string }>({
  id: "character.toggleCondition",
  params: objectOf({ id: isString, condition: isString }),
  title: "Toggle Condition",
  permission: mayEdit,
  run: ({ campaign }, { id, condition }) => toggleCharacterCondition(campaign, id, condition),
});

export const setCondition = command<{ id: string; condition: string; state: ConditionState }>({
  id: "character.setCondition",
  params: objectOf({
    id: isString,
    condition: isString,
    state: oneOf("clear", "marked", "locked"),
  }),
  title: "Change Condition",
  permission: mayEdit,
  run: ({ campaign }, { id, condition, state }) =>
    setCharacterCondition(campaign, id, condition, state),
});

export const setLearned = command<{ id: string; action: string; known: boolean }>({
  id: "character.setLearned",
  params: objectOf({ id: isString, action: isString, known: isBoolean }),
  title: "Learn Move",
  permission: mayEdit,
  run: ({ campaign }, { id, action, known }) => setCharacterLearned(campaign, id, action, known),
});

export const setLoadout = command<{
  id: string;
  loadout: string;
  options: string[];
  free?: boolean | undefined;
}>({
  id: "character.setLoadout",
  params: objectOf({
    id: isString,
    loadout: isString,
    options: arrayOf(isString),
    free: optional(isBoolean),
  }),
  title: "Change Loadout",
  permission: mayEdit,
  run: ({ campaign }, { id, loadout, options, free }) =>
    setCharacterLoadout(campaign, id, loadout, options, free),
});

const RESTS = { "short-rest": "Short Rest", "long-rest": "Long Rest" } as const;

export const rest = command<{ event: ResetEvent; characterId?: string | undefined }>({
  id: "character.rest",
  params: objectOf({
    event: oneOf("short-rest", "long-rest", "turn"),
    characterId: optional(isString),
  }),
  title: (_, { event }) => (event === "turn" ? "End Turn" : RESTS[event]),
  aliases: ["rest"],
  source: (ctx, { characterId }) =>
    getCharacter(ctx.campaign, actor(ctx, characterId))?.name ?? systemOf(ctx.campaign).name,
  detail: (ctx, { characterId }) => {
    const c = getCharacter(ctx.campaign, actor(ctx, characterId));
    return c && `Refill ${c.name}’s resources`;
  },
  available: (ctx, { characterId }) => editable(ctx, actor(ctx, characterId)),
  offers: (ctx) => {
    const resets = new Set(systemOf(ctx.campaign).resources.flatMap((r) => r.resets ?? []));
    const me = !!getCharacter(ctx.campaign, actingCharacterId(ctx.campaign));
    return (["short-rest", "long-rest"] as const)
      .filter((e) => resets.has(e))
      .map((event) => ({ params: { event }, mine: me }));
  },
  run: (ctx, { event, characterId }) => {
    const id = actor(ctx, characterId);
    if (id) restCharacter(ctx.campaign, id, event);
  },
});

export const pressTrackerButton = command<{ characterId: string; button: TrackerButton }, boolean>({
  id: "character.pressTracker",
  params: objectOf({ characterId: isString, button: isPlain<TrackerButton> }),
  title: (_, { button }) => button.name,
  available: (ctx, { characterId }) => editable(ctx, characterId),
  run: ({ campaign }, { characterId, button }) => pressTracker(campaign, characterId, button),
});

// Moves

/** A move the character can make: their own, one they've learned, or any of the system's (homebrew included). */
function moveFor(
  ctx: CampaignContext,
  characterId: string | undefined,
  id: string,
): ActionDef | undefined {
  const system = systemOf(ctx.campaign);
  const c = getCharacter(ctx.campaign, characterId);
  const own = c ? actionsFor(c, system, derive(c, system)) : [];
  return own.find((m) => m.id === id) ?? system.actions.find((m) => m.id === id);
}

/** Start making a move: it asks for targets and choices first if it needs them. */
export const startMove = command<{
  move: string;
  characterId?: string | undefined;
  targets?: MoveTarget[] | undefined;
  extra?: number | undefined;
}>({
  id: SLOT_COMMANDS.move,
  params: objectOf({
    move: isString,
    characterId: optional(isString),
    targets: optional(arrayOf(isPlain<MoveTarget>)),
    extra: optional(isNumber),
  }),
  kind: "move",
  title: (ctx, { move, characterId }) =>
    moveFor(ctx, actor(ctx, characterId), move)?.name ?? "Move",
  aliases: ["move"],
  source: (ctx) => systemOf(ctx.campaign).name,
  detail: (ctx, { move, characterId }) => moveFor(ctx, actor(ctx, characterId), move)?.trigger,
  available: (ctx, { move, characterId }) => {
    const id = actor(ctx, characterId);
    const can = editable(ctx, id);
    if (can !== true) return can;
    const c = getCharacter(ctx.campaign, id)!;
    const system = systemOf(ctx.campaign);
    const m = actionsFor(c, system, derive(c, system)).find((a) => a.id === move);
    if (!m) return "Not one of this character’s moves";
    return !sessionMoveUsed(ctx.campaign, c.id, m) || "Already used this session";
  },
  offers: (ctx) => {
    const system = systemOf(ctx.campaign);
    const me = getCharacter(ctx.campaign, actingCharacterId(ctx.campaign));
    const mine = new Set(me ? actionsFor(me, system, derive(me, system)).map((m) => m.id) : []);
    return system.actions.map((m) => ({
      params: { move: m.id },
      mine: mine.has(m.id),
      ...(m.tags ? { tags: m.tags } : {}),
    }));
  },
  // Rolling posts to the chat, which isn't taken back.
  undoGroup: false,
  run: (ctx, { move, characterId, targets, extra }) => {
    const id = actor(ctx, characterId);
    const m = moveFor(ctx, id, move);
    if (id && m)
      beginMove(ctx.campaign, id, m, targets, extra === undefined ? undefined : { extra });
  },
});

/** Roll a move once its choices are made. */
export const makeMove = command<
  {
    characterId: string;
    move: ActionDef;
    choice?: MoveChoice | undefined;
    targets?: MoveTarget[] | undefined;
  },
  ReturnType<typeof rollMove>
>({
  id: "move.make",
  params: objectOf({
    characterId: isString,
    move: isPlain<ActionDef>,
    choice: optional(isPlain<MoveChoice>),
    targets: optional(arrayOf(isPlain<MoveTarget>)),
  }),
  title: (_, { move }) => move.name,
  available: (ctx, { characterId }) => editable(ctx, characterId),
  undoGroup: false,
  run: ({ campaign }, { characterId, move, choice, targets }) =>
    rollMove(campaign, characterId, move, choice, targets),
});

/** A follow-up on a move's card: mark XP, take damage, roll damage. */
export const applySuggestion = command<{ characterId: string; suggestion: MoveSuggestion }>({
  id: "move.applySuggestion",
  params: objectOf({ characterId: isString, suggestion: isPlain<MoveSuggestion> }),
  title: (_, { suggestion }) => suggestion.label,
  available: (ctx, { characterId }) => editable(ctx, characterId),
  run: ({ campaign }, { characterId, suggestion }) =>
    applyMoveSuggestion(campaign, characterId, suggestion),
});

/** Answer a move card's roll request for one target: their owner or the GM rolls it. A roll, so not undone. */
export const answerRollRequest = command<{
  messageId: string;
  target: MoveTarget;
  save: SaveRequest;
  mode?: string | undefined;
  concentration?: boolean | undefined;
}>({
  id: "move.answerSave",
  params: objectOf({
    messageId: isString,
    target: isPlain<MoveTarget>,
    save: isPlain<SaveRequest>,
    mode: optional(isString),
    concentration: optional(isBoolean),
  }),
  title: "Roll Save",
  permission: (ctx, { target }) => canAnswer(ctx.campaign, target) || "Not your character",
  undoGroup: false,
  run: ({ campaign }, { messageId, target, save, mode, concentration }) =>
    answerSave(campaign, messageId, target, save, mode, concentration),
});

/** Apply a roll card's damage or healing to a target. */
export const applyCardDamage = command<{
  messageId: string;
  target: MoveTarget;
  amount: number;
  healing: boolean;
  armor?: boolean | undefined;
  type?: string | undefined;
  shieldItemId?: string | undefined;
}>({
  id: "move.applyDamage",
  params: objectOf({
    messageId: isString,
    target: isPlain<MoveTarget>,
    amount: isNumber,
    healing: isBoolean,
    armor: optional(isBoolean),
    type: optional(isString),
    shieldItemId: optional(isString),
  }),
  title: (_, { healing, amount }) => (healing ? `Heal ${amount}` : `Apply ${amount} Damage`),
  permission: "gm",
  run: ({ campaign }, { messageId, target, amount, healing, armor, type, shieldItemId }) =>
    applyDamage(campaign, messageId, target, amount, healing, {
      ...(armor !== undefined ? { armor } : {}),
      ...(type !== undefined ? { type } : {}),
      ...(shieldItemId !== undefined ? { shieldItemId } : {}),
    }),
});

// Gear

const holder = (ctx: CampaignContext, { characterId }: { characterId?: string | undefined }) =>
  editable(ctx, actor(ctx, characterId));
const itemOf = (ctx: CampaignContext, characterId: string | undefined, itemId: string) =>
  getCharacter(ctx.campaign, actor(ctx, characterId))?.inventory.find((i) => i.id === itemId);

/** Add a library item (homebrew included) to a character's inventory: the acting character's, unless named. */
export const addItem = command<{
  item: string;
  characterId?: string | undefined;
  equip?: boolean | undefined;
}>({
  id: SLOT_COMMANDS.library,
  params: objectOf({ item: isString, characterId: optional(isString), equip: optional(isBoolean) }),
  kind: "entry",
  title: (ctx, { item }) => systemOf(ctx.campaign).items.find((i) => i.id === item)?.name ?? "Item",
  source: (ctx) => systemOf(ctx.campaign).name,
  detail: (ctx, { item, characterId }) => {
    const me = getCharacter(ctx.campaign, actor(ctx, characterId));
    return me
      ? `Add to ${me.name}’s inventory. Shift+Enter shows it in the Libraries.`
      : systemOf(ctx.campaign).items.find((i) => i.id === item)?.description;
  },
  available: (ctx, p) =>
    !systemOf(ctx.campaign).items.some((i) => i.id === p.item)
      ? "Not in the library"
      : holder(ctx, p),
  offers: (ctx) =>
    systemOf(ctx.campaign).items.map((i) => ({
      params: { item: i.id },
      group: "library" as const,
      tags: i.tags,
      open: () => ctx.library.browse("item"),
    })),
  run: (ctx, { item, characterId, equip }) => {
    const id = actor(ctx, characterId);
    const def = systemOf(ctx.campaign).items.find((i) => i.id === item);
    if (id && def) addItemTo(ctx.campaign, id, def, equip);
  },
});

/**
 * Get a library item for a character the way the game says (paying for it,
 * say): one step. Some can only be granted by the GM.
 */
export const acquireItem = characterCommand<{ characterId: string; item: string }>({
  id: "item.acquire",
  params: objectOf({ characterId: isString, item: isString }),
  title: (ctx, { item }) =>
    `Get ${systemOf(ctx.campaign).items.find((i) => i.id === item)?.name ?? "Item"}`,
  available: (ctx, { characterId, item }) => {
    const system = systemOf(ctx.campaign);
    const def = system.items.find((i) => i.id === item);
    if (!def) return "Not in the library";
    const how = system.acquireItem?.(def, getCharacter(ctx.campaign, characterId));
    if (how?.gmOnly && !ctx.isGm()) return "Only the GM can grant this";
    return how?.blocked ?? true;
  },
  run: ({ campaign }, { characterId, item }) => {
    const system = systemOf(campaign);
    const def = system.items.find((i) => i.id === item);
    if (!def) return;
    const how = system.acquireItem?.(def, getCharacter(campaign, characterId));
    for (const [field, value] of Object.entries(how?.data ?? {}))
      setCharacterData(campaign, characterId, field, value);
    addItemTo(campaign, characterId, def);
  },
});

/** Give a character a copy of some gear: an item from someone else's inventory, or a library item as it stands. */
export const giveItem = command<{
  characterId: string;
  item: ItemDef;
  equip?: boolean | undefined;
}>({
  id: "item.give",
  params: objectOf({ characterId: isString, item: isPlain<ItemDef>, equip: optional(isBoolean) }),
  title: (_, { item }) => `Give ${item.name}`,
  permission: (ctx, { characterId }) => editable(ctx, characterId),
  run: ({ campaign }, { characterId, item, equip }) =>
    addItemTo(campaign, characterId, item, equip),
});

/** Gear with uses that the system lets be used now. */
export const itemUsable = (ctx: CampaignContext, i: ItemInstance) => {
  const system = systemOf(ctx.campaign);
  return (
    i.uses !== undefined &&
    (system.itemUsable?.(
      i,
      system.items.find((entry) => entry.id === i.defId),
    ) ??
      true)
  );
};

export const useItem = command<{ itemId: string; characterId?: string | undefined }, boolean>({
  id: SLOT_COMMANDS.use,
  params: objectOf({ itemId: isString, characterId: optional(isString) }),
  kind: "item",
  title: (ctx, { itemId, characterId }) =>
    `Use ${itemOf(ctx, characterId, itemId)?.name ?? "Item"}`,
  source: (ctx, { characterId }) =>
    getCharacter(ctx.campaign, actor(ctx, characterId))?.name ?? "Gear",
  detail: (ctx, { itemId, characterId }) => {
    const i = itemOf(ctx, characterId, itemId);
    return i?.uses !== undefined ? `${i.usesLeft ?? 0}/${i.uses} uses left` : undefined;
  },
  available: (ctx, p) => {
    const i = itemOf(ctx, p.characterId, p.itemId);
    if (!i) return "Not in this character’s gear";
    return !i.usesLeft ? "No uses left" : holder(ctx, p);
  },
  section: "act",
  offers: (ctx) =>
    (getCharacter(ctx.campaign, actingCharacterId(ctx.campaign))?.inventory ?? [])
      .filter((i) => itemUsable(ctx, i))
      .map((i) => ({ params: { itemId: i.id }, mine: true })),
  menu: {
    item: (ctx, { characterId, itemId }) => {
      const i = itemOf(ctx, characterId, itemId);
      return i && itemUsable(ctx, i) ? [{ params: { characterId, itemId } }] : [];
    },
  },
  run: (ctx, { itemId, characterId }) => {
    const id = actor(ctx, characterId);
    return !!id && spendItemUse(ctx.campaign, id, itemId);
  },
});

export const equipItem = command<{ itemId: string; characterId?: string | undefined }>({
  id: "item.equip",
  params: objectOf({ itemId: isString, characterId: optional(isString) }),
  kind: "item",
  title: (ctx, { itemId, characterId }) => {
    const i = itemOf(ctx, characterId, itemId);
    return `${i?.equipped ? "Unequip" : "Equip"} ${i?.name ?? "Item"}`;
  },
  source: (ctx, { characterId }) =>
    getCharacter(ctx.campaign, actor(ctx, characterId))?.name ?? "Gear",
  available: (ctx, p) =>
    itemOf(ctx, p.characterId, p.itemId) ? holder(ctx, p) : "Not in this character’s gear",
  section: "act",
  offers: (ctx) =>
    (getCharacter(ctx.campaign, actingCharacterId(ctx.campaign))?.inventory ?? [])
      .filter((i) => i.equippable)
      .map((i) => ({ params: { itemId: i.id }, mine: true })),
  menu: {
    item: (ctx, { characterId, itemId }) =>
      itemOf(ctx, characterId, itemId)?.equippable ? [{ params: { characterId, itemId } }] : [],
  },
  run: (ctx, { itemId, characterId }) => {
    const id = actor(ctx, characterId);
    const i = itemOf(ctx, id, itemId);
    if (id && i) updateCharacterItem(ctx.campaign, id, itemId, { equipped: !i.equipped });
  },
});

export const updateItem = command<{
  characterId: string;
  itemId: string;
  patch: Partial<ItemInstance>;
}>({
  id: "item.update",
  params: objectOf({
    characterId: isString,
    itemId: isString,
    patch: isPlain<Partial<ItemInstance>>,
  }),
  title: "Change Item",
  permission: holder,
  undoGroup: ({ characterId, itemId, patch }) =>
    `item ${characterId} ${itemId} ${Object.keys(patch).sort().join()}`,
  run: ({ campaign }, { characterId, itemId, patch }) =>
    updateCharacterItem(campaign, characterId, itemId, patch),
});

export const markItemTrack = command<
  { characterId: string; itemId: string; unlock?: string | undefined },
  boolean
>({
  id: "item.markTrack",
  params: objectOf({ characterId: isString, itemId: isString, unlock: optional(isString) }),
  title: "Mark Track",
  permission: holder,
  run: ({ campaign }, { characterId, itemId, unlock }) =>
    markArtifactTrack(campaign, characterId, itemId, unlock),
});

export const clearItemTrack = command<{ characterId: string; itemId: string }, boolean>({
  id: "item.clearTrack",
  params: objectOf({ characterId: isString, itemId: isString }),
  title: "Clear Track",
  permission: holder,
  run: ({ campaign }, { characterId, itemId }) => clearArtifactTrack(campaign, characterId, itemId),
});

export const changeItemGraphic = command<{ characterId: string; itemId: string }>({
  id: "item.changeGraphic",
  params: objectOf({ characterId: isString, itemId: isString }),
  title: "Change Graphic…",
  icon: IconImage,
  section: "edit",
  transact: false,
  menu: { item: (_, t) => [{ params: t }] },
  run: (ctx, { characterId, itemId }) => {
    const i = itemOf(ctx, characterId, itemId);
    if (i) ctx.table.editGraphic("item", i.defId ?? i.id, i.name, i.icon);
  },
});

export const removeItem = command<{ characterId: string; itemId: string }>({
  id: "item.remove",
  params: objectOf({ characterId: isString, itemId: isString }),
  title: (ctx, { characterId, itemId }) =>
    `Remove ${itemOf(ctx, characterId, itemId)?.name ?? "Item"}`,
  icon: IconDelete,
  danger: true,
  section: "delete",
  permission: holder,
  menu: { item: (_, t) => [{ params: t }] },
  run: ({ campaign }, { characterId, itemId }) => removeItemFrom(campaign, characterId, itemId),
});

// Relationships

export const setRelationship = command<{ from: string; to: string; label: string }>({
  id: "relationship.set",
  params: objectOf({ from: isString, to: isString, label: isString }),
  title: "Change Relationship",
  permission: (ctx, { from }) => editable(ctx, from),
  undoGroup: ({ from, to }) => `relationship ${from} ${to}`,
  run: ({ campaign }, { from, to, label }) => relate(campaign.characters, from, to, label),
});

export const setRelationshipDepth = command<{
  from: string;
  to: string;
  depth: number;
  max: number;
}>({
  id: "relationship.setDepth",
  params: objectOf({ from: isString, to: isString, depth: isNumber, max: isNumber }),
  title: "Change Relationship",
  permission: (ctx, { from }) => editable(ctx, from),
  run: ({ campaign }, { from, to, depth, max }) =>
    setDepth(campaign.characters, from, to, depth, max),
});

export const removeRelationship = command<{ from: string; to: string }>({
  id: "relationship.remove",
  params: objectOf({ from: isString, to: isString }),
  title: "Remove Relationship",
  permission: (ctx, { from }) => editable(ctx, from),
  run: ({ campaign }, { from, to }) => unrelate(campaign.characters, from, to),
});

export const characterFolders = folderCommands("character", {
  create: ({ campaign }, name) => createFolder(campaign, name),
  rename: ({ campaign }, id, name) => renameFolder(campaign, id, name),
  remove: ({ campaign }, id) => deleteFolder(campaign, id),
});

export const characterCommands = [
  openCharacter,
  viewSheet,
  claim,
  release,
  fileCharacter,
  changeCharacterGraphic,
  deleteCharacter,
  newCharacter,
  newNpc,
  npcFromMonster,
  copyCharacter,
  resetCopy,
  setTemplate,
  setField,
  setData,
  bumpData,
  setScore,
  setResource,
  bumpResource,
  setModifier,
  setNpcField,
  toggleCondition,
  setCondition,
  setLearned,
  setLoadout,
  rest,
  pressTrackerButton,
  startMove,
  makeMove,
  applySuggestion,
  answerRollRequest,
  applyCardDamage,
  addItem,
  acquireItem,
  giveItem,
  useItem,
  equipItem,
  updateItem,
  markItemTrack,
  clearItemTrack,
  changeItemGraphic,
  removeItem,
  setRelationship,
  setRelationshipDepth,
  removeRelationship,
  ...characterFolders.all,
];
