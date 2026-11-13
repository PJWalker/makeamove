import { arrayOf, isNumber, isObject, isString, oneOf } from "../data/guards";
import { collection, list, lww, record, subdoc, type Root } from "../data/schema";
import { systemCampaignData } from "../systems/schema";
import { characterEntry } from "../features/characters/schema";
import { combatShape } from "../features/combat/schema";
import { homebrewField } from "../features/homebrew/schema";
import { noteEntry, type NoteFolder } from "../features/notes/schema";
import type { EntityGraphic } from "../media/images";
import type { EntryIconName } from "../ui/entryIcons";
import { GRID_TYPES } from "../scene/grid";
import { TOKEN_STYLES } from "../scene/types";
import type * as Y from "yjs";

/*
 * The campaign root document (see design doc, "Data model").
 *
 * Each scene's contents (maps, tokens, drawings) live in its `doc`, a Yjs
 * subdocument that is loaded only while the scene is open (see SceneDoc);
 * each note page's text is a subdocument too (noteDoc.ts), and so is each
 * chunk of the chat log (chatLog.ts).
 */

export const campaignMeta = record({
  name: lww(isString),
  systemId: lww(isString),
  systemVersion: lww(isString),
  /** The secret to the campaign's room (invite links carry it). */
  roomKey: lww(isString),
  createdAt: lww(isNumber),
  createdBy: lww(isString),
  defaultTokenStyle: lww(oneOf(...TOKEN_STYLES.map((s) => s.id))).or("disc"),
  defaultGridType: lww(oneOf(...GRID_TYPES.map((g) => g.id))).or("square"),
  /** The scene last announced to the table. */
  tableScene: lww(isString),
  noteFoldersMade: lww((v): v is boolean => typeof v === "boolean").or(false),
  /** Sessions started so far. */
  sessions: lww(isNumber).or(0),
});

/** What a player has renamed a hotbar slot to, or given it as an icon (workspace/commands/custom.ts). */
export interface SlotLook {
  label?: string | undefined;
  icon?: EntryIconName | undefined;
}

export const memberEntry = record({
  name: lww(isString),
  role: lww(oneOf("gm", "player", "observer")).or("player"),
  joinedAt: lww(isNumber),
  activeSceneId: lww(isString),
  /** The character whose sheet they have open. */
  character: lww(isString),
  /** The player character they've claimed. */
  playing: lww(isString),
  /** Character id ("global" with none) -> the action ids on their hotbar. */
  hotbars: collection(lww(arrayOf(isString))),
  /** Hotbar slot -> what they've renamed it or given it as an icon. */
  hotbarLooks: collection(lww(isObject<SlotLook>)),
  /** Action id -> the key combo they've bound to it. */
  shortcuts: collection(lww(isString)),
});

export const sceneEntry = record({
  name: lww(isString).or("Untitled scene"),
  folder: lww(isString),
  /**
   * Without one the canvas takes a darkened version of the main map's colour
   * ("auto"). The UI is tinted from it when there is one, else from the map,
   * else from the default canvas colour.
   */
  canvasColour: lww(isString),
  order: lww(isString).or("a0"),
  visibility: lww(oneOf("everyone", "owners", "gm")).or("everyone"),
  doc: subdoc(),
});

export const campaignShape = {
  meta: campaignMeta,
  members: collection(memberEntry, "member"),
  /** deviceId -> each player the GM removed. */
  revoked: collection(lww(isObject<{ name: string; at: number; by: string }>), "removed member"),
  scenes: collection(sceneEntry, "scene"),
  sceneFolders: collection(lww(isObject<{ name: string }>), "scene folder"),
  characters: collection(characterEntry, "character"),
  characterFolders: collection(lww(isObject<{ name: string }>), "character folder"),
  /** The index of note pages; each page's text is its subdocument. */
  notes: collection(noteEntry, "note"),
  noteFolders: collection(lww(isObject<NoteFolder>), "note folder"),
  /** `messageId/field` -> what changes about a chat message (chat/messageState.ts). */
  messageState: collection(lww<unknown>()),
  /** The turn tracker (combat/combat.ts). */
  ...combatShape,
  /** Gear and moves made at the table (homebrew/homebrew.ts). */
  homebrew: homebrewField,
  /** Entity key -> its shared image or built-in icon. */
  entityGraphics: collection(lww(isObject<EntityGraphic>), "entity graphic"),
  /** Each extension's campaign-wide data, by extension id. */
  ext: collection(systemCampaignData),
  /** The chat log's chunks, oldest first (chat/chatLog.ts). */
  chat: list<Y.Doc>(),
};

export type CampaignRoot = Root<typeof campaignShape>;
export type Members = CampaignRoot["members"];
export type Scenes = CampaignRoot["scenes"];
export type Characters = CampaignRoot["characters"];
export type NotesIndex = CampaignRoot["notes"];
