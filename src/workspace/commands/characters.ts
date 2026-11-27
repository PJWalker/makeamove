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
import type {
  CharacterView,
  ItemInstance,
  TemplateSettings,
} from "../../features/characters/types";
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
} from "../../lib/guards";
import type { Availability } from "../../kernel/commands";
import type { ActionDef, ItemDef, ResetEvent } from "../../systems/types";
import { IconDelete, IconFolder, IconImage } from "../../ui/icons";
import type { CampaignContext } from "../campaignContext";
import { folderCommands, moveFolderOffers } from "./folders";
import { command } from "./types";
import type { TableCommand } from "./types";

/* Characters: making, playing, filing and changing them, their moves and their gear. */

const isId = objectOf({ id: isString });
const isValue = (v: unknown): v is DataValue => isString(v) || isNumber(v) || isBoolean(v);
const isPlain = <T extends object>(v: unknown): v is T => isObject<T>(v);

/** Only a character's player, or the GM, changes it. */
export const editable = (context: CampaignContext, id: string | undefined): Availability => {
  const c = getCharacter(context.campaign, id);
  if (!c) return id ? "That character is gone" : "Choose a character first";
  return canEdit(context.campaign, c) || "Not your character";
};
const mayEdit = (context: CampaignContext, { id }: { id: string }) => editable(context, id);
/** For calls about the acting character unless they name one. */
const actor = (context: CampaignContext, characterId: string | undefined) =>
  characterId ?? actingCharacterId(context.campaign);
/** For relationships: only the player of the character they're from, or the GM, changes them. */
const mayEditFrom = (context: CampaignContext, { from }: { from: string }) =>
  editable(context, from);
/** A library item (homebrew included) by id. */
const libraryItem = (context: CampaignContext, id: string) =>
  systemOf(context.campaign).items.find((index) => index.id === id);

/**
 * A change to one character, as a command: only their player or the GM
 * makes it. Game systems declare their own with this.
 */
export const characterCommand = <P extends { characterId: string }, R = unknown>(
  spec: Omit<TableCommand<P, R>, "permission">,
): TableCommand<P, R> =>
  command<P, R>({ ...spec, permission: (context, p) => editable(context, p.characterId) });

// Finding, playing and filing

export const openCharacter = command<{ id: string }>({
  id: "character.open",
  params: isId,
  kind: "entry",
  title: (context, { id }) => getCharacter(context.campaign, id)?.name ?? "Character",
  detail: (context, { id }) =>
    getCharacter(context.campaign, id)?.kind === "npc" ? "NPC" : "Character",
  source: "Characters",
  section: "open",
  transact: false,
  available: (context, { id }) => !!getCharacter(context.campaign, id) || "That character is gone",
  offers: (context) =>
    listCharacters(context.campaign).map((c) => ({
      params: { id: c.id },
      group: "character" as const,
    })),
  menu: { character: (_, { id }) => [{ params: { id }, title: "Open Character" }] },
  run: (context, { id }) => {
    context.links.openCharacter(id);
  },
});

/** Show a character in the Characters panel (or none); where this player is looking, not an edit. */
export const viewSheet = command<{ id?: string | undefined }>({
  id: "character.view",
  params: objectOf({ id: optional(isString) }),
  title: "Show Character",
  undoGroup: false,
  run: ({ campaign }, { id }) => {
    viewCharacter(campaign, id);
  },
});

export const claim = command<{ id: string }>({
  id: "character.claim",
  params: isId,
  title: "Play This Character",
  section: "play",
  undoGroup: false,
  permission: (context, { id }) => {
    const c = getCharacter(context.campaign, id);
    return (!!c && canClaim(context.campaign, c)) || "Someone else plays them";
  },
  menu: {
    character: (context, { id }) =>
      playedCharacterId(context.campaign) === id ? [] : [{ params: { id } }],
  },
  run: ({ campaign }, { id }) => {
    claimCharacter(campaign, id);
  },
});

export const release = command<{ id: string }>({
  id: "character.release",
  params: isId,
  title: "Stop Playing",
  section: "play",
  undoGroup: false,
  permission: (context, { id }) =>
    playedCharacterId(context.campaign) === id || "You don’t play them",
  menu: { character: (_, { id }) => [{ params: { id } }] },
  run: ({ campaign }) => {
    releaseCharacter(campaign);
  },
});

export const fileCharacter = command<{ id: string; folder?: string | undefined }>({
  id: "character.moveToFolder",
  params: objectOf({ id: isString, folder: optional(isString) }),
  title: "Move to Folder",
  icon: IconFolder,
  section: "file",
  permission: mayEdit,
  menu: {
    character: (context, { id }) => {
      const c = getCharacter(context.campaign, id);
      return moveFolderOffers(id, c?.folder, listFolders(context.campaign));
    },
  },
  run: ({ campaign }, { id, folder }) => {
    moveToFolder(campaign, id, folder);
  },
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
  run: (context, { id }) => {
    context.table.editGraphic("character", id, getCharacter(context.campaign, id)?.name ?? "");
  },
});

export const deleteCharacter = command<{ id: string }>({
  id: "character.delete",
  params: isId,
  title: "Delete Character…",
  icon: IconDelete,
  danger: true,
  section: "delete",
  permission: mayEdit,
  confirm: (context, { id }) => {
    const name = getCharacter(context.campaign, id)?.name ?? "this character";
    return {
      title: "Delete Character",
      body: `Delete ${name}? Their sheet is gone for everyone, and tokens on the map stop being linked to them.`,
      subject: name,
      confirmLabel: "Delete",
      danger: true,
    };
  },
  menu: { character: (_, { id }) => [{ params: { id } }] },
  run: ({ campaign }, { id }) => {
    removeCharacter(campaign, id);
  },
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
  run: ({ campaign }, { id }) => {
    resetCharacterCopy(campaign, id);
  },
});

export const setTemplate = command<{ id: string; settings: TemplateSettings | null }>({
  id: "character.setTemplate",
  params: objectOf({
    id: isString,
    settings: (v): v is TemplateSettings | null => v === null || isObject(v),
  }),
  title: "Make Template",
  permission: mayEdit,
  run: ({ campaign }, { id, settings }) => {
    setCharacterTemplate(campaign, id, settings);
  },
});

// The sheet. Changes to one field in quick succession (typing, clicking +) are one undo step.

export const setField = command<{ id: string; key: CoreField; value: unknown }>({
  id: "character.setField",
  params: objectOf({ id: isString, key: isString }) as never,
  title: "Change Character",
  permission: mayEdit,
  undoGroup: ({ id, key }) => `field ${id} ${key}`,
  run: ({ campaign }, { id, key, value }) => {
    setCharacterField(campaign, id, key, value as Parameters<typeof setCharacterField>[3]);
  },
});

export const setData = command<{ id: string; key: string; value: DataValue }>({
  id: "character.setData",
  params: objectOf({ id: isString, key: isString, value: isValue }),
  title: "Change Character",
  permission: mayEdit,
  undoGroup: ({ id, key }) => `data ${id} ${key}`,
  run: ({ campaign }, { id, key, value }) => {
    setCharacterData(campaign, id, key, value);
  },
});

export const bumpData = command<{ id: string; key: string; by: number; max?: number | undefined }>({
  id: "character.bumpData",
  params: objectOf({ id: isString, key: isString, by: isNumber, max: optional(isNumber) }),
  title: "Change Character",
  permission: mayEdit,
  undoGroup: ({ id, key }) => `data ${id} ${key}`,
  run: ({ campaign }, { id, key, by, max }) => {
    bumpCharacterData(campaign, id, key, by, max);
  },
});

export const setScore = command<{ id: string; stat: string; score: number }>({
  id: "character.setScore",
  params: objectOf({ id: isString, stat: isString, score: isNumber }),
  title: "Change Score",
  permission: mayEdit,
  undoGroup: ({ id, stat }) => `score ${id} ${stat}`,
  run: ({ campaign }, { id, stat, score }) => {
    setCharacterScore(campaign, id, stat, score);
  },
});

export const setResource = command<{ id: string; resource: string; value: number }>({
  id: "character.setResource",
  params: objectOf({ id: isString, resource: isString, value: isNumber }),
  title: "Change Resource",
  permission: mayEdit,
  undoGroup: ({ id, resource }) => `resource ${id} ${resource}`,
  run: ({ campaign }, { id, resource, value }) => {
    setCharacterResource(campaign, id, resource, value);
  },
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
  run: ({ campaign }, { id, resource, by, max }) => {
    bumpCharacterResource(campaign, id, resource, by, max);
  },
});

export const setModifier = command<{ id: string; modifier: string; value: number }>({
  id: "character.setModifier",
  params: objectOf({ id: isString, modifier: isString, value: isNumber }),
  title: "Change Modifier",
  permission: mayEdit,
  undoGroup: ({ id, modifier }) => `modifier ${id} ${modifier}`,
  run: ({ campaign }, { id, modifier, value }) => {
    setCharacterModifier(campaign, id, modifier, value);
  },
});

export const setNpcField = command<{ id: string; field: string; value: number | string }>({
  id: "character.setNpcField",
  params: objectOf({
    id: isString,
    field: isString,
    value: (v): v is number | string => isString(v) || isNumber(v),
  }),
  title: "Change NPC",
  permission: mayEdit,
  undoGroup: ({ id, field }) => `npc ${id} ${field}`,
  run: ({ campaign }, { id, field, value }) => {
    setCharacterNpcField(campaign, id, field, value);
  },
});

export const toggleCondition = command<{ id: string; condition: string }>({
  id: "character.toggleCondition",
  params: objectOf({ id: isString, condition: isString }),
  title: "Toggle Condition",
  permission: mayEdit,
  run: ({ campaign }, { id, condition }) => {
    toggleCharacterCondition(campaign, id, condition);
  },
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
  run: ({ campaign }, { id, condition, state }) => {
    setCharacterCondition(campaign, id, condition, state);
  },
});

export const setLearned = command<{ id: string; action: string; known: boolean }>({
  id: "character.setLearned",
  params: objectOf({ id: isString, action: isString, known: isBoolean }),
  title: "Learn Move",
  permission: mayEdit,
  run: ({ campaign }, { id, action, known }) => {
    setCharacterLearned(campaign, id, action, known);
  },
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
  run: ({ campaign }, { id, loadout, options, free }) => {
    setCharacterLoadout(campaign, id, loadout, options, free);
  },
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
  source: (context, { characterId }) =>
    getCharacter(context.campaign, actor(context, characterId))?.name ??
    systemOf(context.campaign).name,
  detail: (context, { characterId }) => {
    const c = getCharacter(context.campaign, actor(context, characterId));
    return c && `Refill ${c.name}’s resources`;
  },
  available: (context, { characterId }) => editable(context, actor(context, characterId)),
  offers: (context) => {
    const resets = new Set(systemOf(context.campaign).resources.flatMap((r) => r.resets ?? []));
    const me = !!getCharacter(context.campaign, actingCharacterId(context.campaign));
    return (["short-rest", "long-rest"] as const)
      .filter((e) => resets.has(e))
      .map((event) => ({ params: { event }, mine: me }));
  },
  run: (context, { event, characterId }) => {
    const id = actor(context, characterId);
    if (id) restCharacter(context.campaign, id, event);
  },
});

export const pressTrackerButton = command<{ characterId: string; button: TrackerButton }, boolean>({
  id: "character.pressTracker",
  params: objectOf({ characterId: isString, button: isPlain<TrackerButton> }),
  title: (_, { button }) => button.name,
  available: (context, { characterId }) => editable(context, characterId),
  run: ({ campaign }, { characterId, button }) => pressTracker(campaign, characterId, button),
});

// Moves

/** The moves a character has: their class's, their own and those they've learned. */
function movesOf(context: CampaignContext, c: CharacterView | undefined): ActionDef[] {
  if (!c) return [];
  const system = systemOf(context.campaign);
  return actionsFor(c, system, derive(c, system));
}

/** A move the character can make: their own, one they've learned, or any of the system's (homebrew included). */
function moveFor(
  context: CampaignContext,
  characterId: string | undefined,
  id: string,
): ActionDef | undefined {
  const own = movesOf(context, getCharacter(context.campaign, characterId));
  return (
    own.find((m) => m.id === id) ?? systemOf(context.campaign).actions.find((m) => m.id === id)
  );
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
  title: (context, { move, characterId }) =>
    moveFor(context, actor(context, characterId), move)?.name ?? "Move",
  aliases: ["move"],
  source: (context) => systemOf(context.campaign).name,
  detail: (context, { move, characterId }) =>
    moveFor(context, actor(context, characterId), move)?.trigger,
  available: (context, { move, characterId }) => {
    const id = actor(context, characterId);
    const can = editable(context, id);
    if (can !== true) return can;
    const c = getCharacter(context.campaign, id)!;
    const m = movesOf(context, c).find((a) => a.id === move);
    if (!m) return "Not one of this character’s moves";
    return !sessionMoveUsed(context.campaign, c.id, m) || "Already used this session";
  },
  offers: (context) => {
    const me = getCharacter(context.campaign, actingCharacterId(context.campaign));
    const mine = new Set(movesOf(context, me).map((m) => m.id));
    return systemOf(context.campaign).actions.map((m) => ({
      params: { move: m.id },
      mine: mine.has(m.id),
      ...(m.tags ? { tags: m.tags } : {}),
    }));
  },
  // Rolling posts to the chat, which isn't taken back.
  undoGroup: false,
  run: (context, { move, characterId, targets, extra }) => {
    const id = actor(context, characterId);
    const m = moveFor(context, id, move);
    if (id && m)
      beginMove(context.campaign, id, m, targets, extra === undefined ? undefined : { extra });
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
  available: (context, { characterId }) => editable(context, characterId),
  undoGroup: false,
  run: ({ campaign }, { characterId, move, choice, targets }) =>
    rollMove(campaign, characterId, move, choice, targets),
});

/** A follow-up on a move's card: mark XP, take damage, roll damage. */
export const applySuggestion = command<{ characterId: string; suggestion: MoveSuggestion }>({
  id: "move.applySuggestion",
  params: objectOf({ characterId: isString, suggestion: isPlain<MoveSuggestion> }),
  title: (_, { suggestion }) => suggestion.label,
  available: (context, { characterId }) => editable(context, characterId),
  run: ({ campaign }, { characterId, suggestion }) => {
    applyMoveSuggestion(campaign, characterId, suggestion);
  },
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
  permission: (context, { target }) => canAnswer(context.campaign, target) || "Not your character",
  undoGroup: false,
  run: ({ campaign }, { messageId, target, save, mode, concentration }) => {
    answerSave(campaign, messageId, target, save, mode, concentration);
  },
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
  run: ({ campaign }, { messageId, target, amount, healing, armor, type, shieldItemId }) => {
    applyDamage(campaign, messageId, target, amount, healing, {
      ...(armor === undefined ? {} : { armor }),
      ...(type === undefined ? {} : { type }),
      ...(shieldItemId === undefined ? {} : { shieldItemId }),
    });
  },
});

// Gear

const holder = (context: CampaignContext, { characterId }: { characterId?: string | undefined }) =>
  editable(context, actor(context, characterId));
const itemOf = (context: CampaignContext, characterId: string | undefined, itemId: string) =>
  getCharacter(context.campaign, actor(context, characterId))?.inventory.find(
    (index) => index.id === itemId,
  );
/** Whose gear it is, for the palette: the character's name. */
const gearSource = (
  context: CampaignContext,
  { characterId }: { characterId?: string | undefined },
) => getCharacter(context.campaign, actor(context, characterId))?.name ?? "Gear";
/** The acting character's gear, for the palette. */
const actingInventory = (context: CampaignContext) =>
  getCharacter(context.campaign, actingCharacterId(context.campaign))?.inventory ?? [];

/** Add a library item (homebrew included) to a character's inventory: the acting character's, unless named. */
export const addItem = command<{
  item: string;
  characterId?: string | undefined;
  equip?: boolean | undefined;
}>({
  id: SLOT_COMMANDS.library,
  params: objectOf({ item: isString, characterId: optional(isString), equip: optional(isBoolean) }),
  kind: "entry",
  title: (context, { item }) => libraryItem(context, item)?.name ?? "Item",
  source: (context) => systemOf(context.campaign).name,
  detail: (context, { item, characterId }) => {
    const me = getCharacter(context.campaign, actor(context, characterId));
    return me
      ? `Add to ${me.name}’s inventory. Shift+Enter shows it in the Libraries.`
      : libraryItem(context, item)?.description;
  },
  available: (context, p) =>
    libraryItem(context, p.item) ? holder(context, p) : "Not in the library",
  offers: (context) =>
    systemOf(context.campaign).items.map((index) => ({
      params: { item: index.id },
      group: "library" as const,
      tags: index.tags,
      open: () => {
        context.library.browse("item");
      },
    })),
  run: (context, { item, characterId, equip }) => {
    const id = actor(context, characterId);
    const def = libraryItem(context, item);
    if (id && def) addItemTo(context.campaign, id, def, equip);
  },
});

/**
 * Get a library item for a character the way the game says (paying for it,
 * say): one step. Some can only be granted by the GM.
 */
export const acquireItem = characterCommand<{ characterId: string; item: string }>({
  id: "item.acquire",
  params: objectOf({ characterId: isString, item: isString }),
  title: (context, { item }) => `Get ${libraryItem(context, item)?.name ?? "Item"}`,
  available: (context, { characterId, item }) => {
    const def = libraryItem(context, item);
    if (!def) return "Not in the library";
    const how = systemOf(context.campaign).acquireItem?.(
      def,
      getCharacter(context.campaign, characterId),
    );
    if (how?.gmOnly && !context.isGm()) return "Only the GM can grant this";
    return how?.blocked ?? true;
  },
  run: (context, { characterId, item }) => {
    const { campaign } = context;
    const def = libraryItem(context, item);
    if (!def) return;
    const how = systemOf(campaign).acquireItem?.(def, getCharacter(campaign, characterId));
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
  permission: (context, { characterId }) => editable(context, characterId),
  run: ({ campaign }, { characterId, item, equip }) => {
    addItemTo(campaign, characterId, item, equip);
  },
});

/** Gear with uses that the system lets be used now. */
export const itemUsable = (context: CampaignContext, index: ItemInstance) => {
  const system = systemOf(context.campaign);
  return (
    index.uses !== undefined &&
    (system.itemUsable?.(
      index,
      system.items.find((entry) => entry.id === index.defId),
    ) ??
      true)
  );
};

export const useItem = command<{ itemId: string; characterId?: string | undefined }, boolean>({
  id: SLOT_COMMANDS.use,
  params: objectOf({ itemId: isString, characterId: optional(isString) }),
  kind: "item",
  title: (context, { itemId, characterId }) =>
    `Use ${itemOf(context, characterId, itemId)?.name ?? "Item"}`,
  source: gearSource,
  detail: (context, { itemId, characterId }) => {
    const index = itemOf(context, characterId, itemId);
    return index?.uses === undefined ? undefined : `${index.usesLeft ?? 0}/${index.uses} uses left`;
  },
  available: (context, p) => {
    const index = itemOf(context, p.characterId, p.itemId);
    if (!index) return "Not in this character’s gear";
    return index.usesLeft ? holder(context, p) : "No uses left";
  },
  section: "act",
  offers: (context) =>
    actingInventory(context).flatMap((index) =>
      itemUsable(context, index) ? [{ params: { itemId: index.id }, mine: true }] : [],
    ),
  menu: {
    item: (context, { characterId, itemId }) => {
      const index = itemOf(context, characterId, itemId);
      return index && itemUsable(context, index) ? [{ params: { characterId, itemId } }] : [];
    },
  },
  run: (context, { itemId, characterId }) => {
    const id = actor(context, characterId);
    return !!id && spendItemUse(context.campaign, id, itemId);
  },
});

export const equipItem = command<{ itemId: string; characterId?: string | undefined }>({
  id: "item.equip",
  params: objectOf({ itemId: isString, characterId: optional(isString) }),
  kind: "item",
  title: (context, { itemId, characterId }) => {
    const index = itemOf(context, characterId, itemId);
    return `${index?.equipped ? "Unequip" : "Equip"} ${index?.name ?? "Item"}`;
  },
  source: gearSource,
  available: (context, p) =>
    itemOf(context, p.characterId, p.itemId) ? holder(context, p) : "Not in this character’s gear",
  section: "act",
  offers: (context) =>
    actingInventory(context).flatMap((index) =>
      index.equippable ? [{ params: { itemId: index.id }, mine: true }] : [],
    ),
  menu: {
    item: (context, { characterId, itemId }) =>
      itemOf(context, characterId, itemId)?.equippable ? [{ params: { characterId, itemId } }] : [],
  },
  run: (context, { itemId, characterId }) => {
    const id = actor(context, characterId);
    const index = itemOf(context, id, itemId);
    if (id && index)
      updateCharacterItem(context.campaign, id, itemId, { equipped: !index.equipped });
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
    `item ${characterId} ${itemId} ${Object.keys(patch).sort().join(",")}`,
  run: ({ campaign }, { characterId, itemId, patch }) => {
    updateCharacterItem(campaign, characterId, itemId, patch);
  },
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
  run: (context, { characterId, itemId }) => {
    const index = itemOf(context, characterId, itemId);
    if (index) context.table.editGraphic("item", index.defId ?? index.id, index.name, index.icon);
  },
});

export const removeItem = command<{ characterId: string; itemId: string }>({
  id: "item.remove",
  params: objectOf({ characterId: isString, itemId: isString }),
  title: (context, { characterId, itemId }) =>
    `Remove ${itemOf(context, characterId, itemId)?.name ?? "Item"}`,
  icon: IconDelete,
  danger: true,
  section: "delete",
  permission: holder,
  menu: { item: (_, t) => [{ params: t }] },
  run: ({ campaign }, { characterId, itemId }) => {
    removeItemFrom(campaign, characterId, itemId);
  },
});

// Relationships

export const setRelationship = command<{ from: string; to: string; label: string }>({
  id: "relationship.set",
  params: objectOf({ from: isString, to: isString, label: isString }),
  title: "Change Relationship",
  permission: mayEditFrom,
  undoGroup: ({ from, to }) => `relationship ${from} ${to}`,
  run: ({ campaign }, { from, to, label }) => {
    relate(campaign.characters, from, to, label);
  },
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
  permission: mayEditFrom,
  run: ({ campaign }, { from, to, depth, max }) => {
    setDepth(campaign.characters, from, to, depth, max);
  },
});

export const removeRelationship = command<{ from: string; to: string }>({
  id: "relationship.remove",
  params: objectOf({ from: isString, to: isString }),
  title: "Remove Relationship",
  permission: mayEditFrom,
  run: ({ campaign }, { from, to }) => {
    unrelate(campaign.characters, from, to);
  },
});

export const characterFolders = folderCommands("character", {
  create: ({ campaign }, name) => createFolder(campaign, name),
  rename: ({ campaign }, id, name) => {
    renameFolder(campaign, id, name);
  },
  remove: ({ campaign }, id) => {
    deleteFolder(campaign, id);
  },
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
