import { effect, signal } from '@preact/signals'
import { generateKeyBetween } from 'fractional-indexing'
import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import { newId, newSecret } from '../lib/ids'
import { device } from './device'
import { forgetCampaign, renameCampaignEntry, summaryOf, touchCampaign, updateCampaignEntry, upsertCampaign } from './registry'
import { getSystem } from '../systems'
import type { Invite } from '../sync/invite'
import { CampaignConnection } from "./campaignConnection";
import type { GridType } from '../scene/grid'
import { sceneDbName } from '../scene/sceneDoc'
import { noteDbName, noteGuid } from '../notes/noteDoc'
import { Vault, vaultDbName, vaultNoteGuid } from '../notes/vault'
import { ChatLog, deleteChatData } from '../chat/chatLog'
import type { EntityGraphic } from "../graphics";
import type { TokenStyle } from '../scene/types'

/*
 * Campaign root document layout (see design doc, "Data model"):
 *
 *   meta     Y.Map   name, systemId, systemVersion, roomKey, createdAt, createdBy,
 *                    defaultTokenStyle, defaultGridType
 *   members  Y.Map   deviceId -> Y.Map { name, role, joinedAt, activeSceneId }
 *   scenes   Y.Map   sceneId  -> Y.Map { name, folder, canvasColour, order, doc }
 *   sceneFolders Y.Map folderId -> { name }
 *   notes    Y.Map   noteId   -> Y.Map { title, folder, order, links, updatedAt, updatedBy, doc }
 *   noteFolders Y.Map folderId -> { name, order }
 *   combat, combatants  Y.Map  the turn tracker (combat/combat.ts)
 *   homebrew Y.Map   id -> gear or move made at the table (homebrew/homebrew.ts)
 *   entityGraphics Y.Map  entity key -> its shared image or built-in icon
 *   messageState Y.Map `messageId/field` -> what changes about a chat message (chat/messageState.ts)
 *
 * Each scene's contents (maps, tokens, drawings) live in its `doc`, a Yjs
 * subdocument that is loaded only while the scene is open (see SceneDoc).
 * Without a canvasColour the canvas takes a darkened version of the main
 * map's colour ("auto"). The UI is always tinted from the map when there is
 * one, and from the canvas colour otherwise.
 */

export type Role = 'gm' | 'player' | 'observer'
export type Visibility = 'everyone' | 'owners' | 'gm'

/** Someone the GM removed from the campaign. */
export interface RevokedView {
  id: string
  name: string
  at: number
}

/**
 * How long a device the GM removed stays connected after rejoining by invite,
 * to hear whether the GM has let it back in.
 */
const REJOIN_CHECK_MS = 5000

/** Campaigns being rejoined by invite link; see Campaign.connect. */
const rejoining = new Set<string>()

export interface MemberView {
  id: string
  name: string
  role: Role
  activeSceneId: string | null
}

export interface SceneView {
  id: string;
  name: string;
  folder?: string;
  /** A chosen canvas colour, or null for auto (from the map). */
  canvasColour: string | null;
  order: string;
  visibility: Visibility;
}

/** The system an invite assumes until the campaign arrives from a peer. */
const DEFAULT_SYSTEM = { id: 'dungeon-world', version: '0.1.0' }
/** Canvas colour for an auto scene with no map yet. */
export const DEFAULT_CANVAS_COLOUR = '#2b3a55'

export interface CampaignDefaults {
  tokenStyle: TokenStyle
  gridType: GridType
}

const dbName = (id: string) => `mam:campaign:${id}`
const sceneGuid = (campaignId: string, sceneId: string) => `${campaignId}/${sceneId}`

export class Campaign {
  readonly id: string;
  readonly doc: Y.Doc;
  readonly meta: Y.Map<any>;
  readonly members: Y.Map<Y.Map<any>>;
  /** deviceId -> { name, at, by } for each player the GM removed. */
  readonly revoked: Y.Map<{ name: string; at: number; by: string }>;
  readonly scenes: Y.Map<Y.Map<any>>;
  /** id -> folder that scenes are filed in. */
  readonly sceneFolders: Y.Map<{ name: string }>;
  /** id -> character (see characters/store.ts). */
  readonly characters: Y.Map<Y.Map<any>>;
  /** id -> folder that characters can be filed in. */
  readonly characterFolders: Y.Map<{ name: string }>;
  /** id -> note page; its text is in a subdocument (see notes/noteDoc.ts). */
  readonly notes: Y.Map<Y.Map<any>>;
  /** id -> folder that notes are filed in. */
  readonly noteFolders: Y.Map<{ name: string; order: string }>;
  /** Roll-request answers, applied damage, edits and pins, by message (see chat/messageState.ts). */
  readonly messageState: Y.Map<any>;
  /** The turn tracker: round and whose turn, and who's in the fight (see combat/combat.ts). */
  readonly combat: Y.Map<any>;
  readonly combatants: Y.Map<any>;
  /** Gear and moves made at the table (see homebrew/homebrew.ts). */
  readonly homebrew: Y.Map<any>;
  /** One custom graphic per entity, shared by lists, windows and scene drops. */
  readonly entityGraphics: Y.Map<EntityGraphic>;
  /** GM-only pages, on GM devices only (see notes/vault.ts). */
  readonly vault = signal<Vault | null>(null);
  private persistence: IndexeddbPersistence;
  private destroyed = false;
  private rejoinCleanups: (() => void)[] = [];
  readonly connection: CampaignConnection;

  /** False while joining by invite, until the first peer has sent the campaign. */
  /** Cursors, pings and rulers; live only while peers are connected. */
  readonly ready = signal(false);

  get presence() {
    return this.connection.presence;
  }
  get peerCount() {
    return this.connection.peerCount;
  }
  get online() {
    return this.connection.online;
  }

  private constructor(id: string) {
    this.id = id;
    this.doc = new Y.Doc({ guid: id });
    this.meta = this.doc.getMap("meta");
    this.members = this.doc.getMap("members");
    this.revoked = this.doc.getMap("revoked");
    this.scenes = this.doc.getMap("scenes");
    this.sceneFolders = this.doc.getMap("sceneFolders");
    this.characters = this.doc.getMap("characters");
    this.characterFolders = this.doc.getMap("characterFolders");
    this.notes = this.doc.getMap("notes");
    this.noteFolders = this.doc.getMap("noteFolders");
    this.messageState = this.doc.getMap("messageState");
    this.combat = this.doc.getMap("combat");
    this.combatants = this.doc.getMap("combatants");
    this.homebrew = this.doc.getMap("homebrew");
    this.entityGraphics = this.doc.getMap("entityGraphics");
    this.persistence = new IndexeddbPersistence(dbName(id), this.doc);
    this.chat = new ChatLog(this.doc, id, device.value.id);
    this.connection = new CampaignConnection(id, this.doc);
  }

  /** Chat, rolls and the move log (see chat/chatLog.ts). */
  readonly chat: ChatLog;

  static async open(id: string): Promise<Campaign> {
    const c = new Campaign(id);
    await c.persistence.whenSynced;
    c.watchMeta();
    await c.chat.start();
    if (c.isGm()) c.vault.value = await Vault.open(id);
    return c;
  }

  /** Track readiness and keep this device's list entry and membership current. */
  private watchMeta() {
    this.checkMembership = () => {
      const named = this.meta.has("name");
      const removed = this.revoked.has(device.value.id);
      // A removed player's device must not add itself back.
      if (named && !removed && !this.members.has(device.value.id)) {
        const name = device.value.name || "Player";
        this.ensureMember(name);
        this.chat.post(
          { kind: "system", text: `${name} joined`, event: "join" },
          { id: device.value.id, name },
        );
      }
      if (named)
        updateCampaignEntry(this.id, {
          name: this.name,
          systemId: this.meta.get("systemId") ?? DEFAULT_SYSTEM.id,
        });
      this.ready.value = named;
      this.removed.value = removed;
      if (removed && !this.checkingRejoin) this.disconnect();
    };
    this.meta.observe(this.checkMembership);
    this.revoked.observe(this.checkMembership);
    this.checkMembership();
  }

  private checkMembership: () => void = () => {};

  /** True once the GM has removed this device from the campaign. */
  readonly removed = signal(false);
  /** Connected despite being removed, to learn whether the GM allowed us back. */
  private checkingRejoin = false;

  /**
   * Join the campaign's room and start syncing with whoever else is in it.
   * A device the GM removed stays out, unless it is rejoining by invite: then
   * it connects, and if it's still removed a few seconds after meeting a
   * peer, it disconnects again.
   */
  async connect(roomKey: string, { rejoin = false } = {}) {
    if (this.connection.sync) return;
    if (this.removed.value && !rejoin) return;
    if (rejoin && this.removed.value) {
      this.checkingRejoin = true;
      let timer = 0;
      const stop = effect(() => {
        if (this.peerCount.value === 0 || timer) return;
        timer = window.setTimeout(() => {
          this.checkingRejoin = false;
          this.checkMembership();
        }, REJOIN_CHECK_MS);
      });
      this.rejoinCleanups.push(stop, () => clearTimeout(timer));
    }
    if (await this.connection.connect(roomKey, () => this.destroyed))
      void this.vault.value?.connect();
  }

  /** The connection to peers, for presence and blob transfer. */
  get sync() {
    return this.connection.sync;
  }

  /** Leave the room. The campaign stays open locally. */
  disconnect() {
    for (const cleanup of this.rejoinCleanups) cleanup();
    this.rejoinCleanups = [];
    this.connection.disconnect();
    this.vault.value?.disconnect();
  }

  destroy() {
    this.destroyed = true;
    clearTimeout(this.sceneNoticeTimer);
    this.disconnect();
    this.chat.destroy();
    this.vault.value?.destroy();
    this.persistence.destroy();
    this.doc.destroy();
  }

  get name(): string {
    return this.meta.get("name") ?? "Untitled campaign";
  }

  rename(name: string) {
    this.meta.set("name", name);
    renameCampaignEntry(this.id, name);
  }

  /** What the GM has chosen for new tokens and scenes. */
  defaults(): CampaignDefaults {
    return {
      tokenStyle: this.meta.get("defaultTokenStyle") ?? "disc",
      gridType: this.meta.get("defaultGridType") ?? "square",
    };
  }

  setDefaults(patch: Partial<CampaignDefaults>) {
    this.doc.transact(() => {
      if (patch.tokenStyle)
        this.meta.set("defaultTokenStyle", patch.tokenStyle);
      if (patch.gridType) this.meta.set("defaultGridType", patch.gridType);
    });
  }

  isGm(deviceId = device.value.id): boolean {
    return this.members.get(deviceId)?.get("role") === "gm";
  }

  // Members

  memberViews(): MemberView[] {
    return [...this.members.entries()].map(([id, m]) => ({
      id,
      name: m.get("name") ?? "Unnamed",
      role: m.get("role") ?? "player",
      activeSceneId: m.get("activeSceneId") ?? null,
    }));
  }

  revokedViews(): RevokedView[] {
    return [...this.revoked.entries()]
      .map(([id, r]) => ({ id, name: r.name, at: r.at }))
      .sort((a, b) => b.at - a.at);
  }

  /**
   * Remove a player (GM only): they leave the member list, and their device
   * stops syncing and won't add itself back. Like the GM's other controls
   * this relies on clients playing fair; anyone keeping the room key could
   * still connect with a modified client.
   */
  revokeMember(id: string) {
    const m = this.members.get(id);
    if (!this.isGm() || id === device.value.id || !m || m.get("role") === "gm")
      return;
    this.doc.transact(() => {
      this.revoked.set(id, {
        name: m.get("name") ?? "Unnamed",
        at: Date.now(),
        by: device.value.id,
      });
      this.members.delete(id);
    });
  }

  /** Let a removed player back in; they rejoin with the invite link. */
  allowBack(id: string) {
    if (this.isGm()) this.revoked.delete(id);
  }

  ensureMember(name: string, role: Role = "player") {
    const id = device.value.id;
    let m = this.members.get(id);
    this.doc.transact(() => {
      if (!m) {
        m = new Y.Map();
        m.set("role", role);
        m.set("joinedAt", Date.now());
        this.members.set(id, m);
      }
      if (name && m.get("name") !== name) m.set("name", name);
    });
  }

  // Scenes

  sceneViews(): SceneView[] {
    return [...this.scenes.entries()]
      .map(([id, s]) => ({
        id,
        name: s.get("name") ?? "Untitled scene",
        folder: s.get("folder") ?? undefined,
        canvasColour: s.get("canvasColour") ?? null,
        order: s.get("order") ?? "a0",
        visibility: s.get("visibility") ?? "everyone",
      }))
      .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
  }

  addScene(name: string): string {
    const id = newId();
    const views = this.sceneViews();
    const last = views.length ? views[views.length - 1].order : null;
    const s = new Y.Map<any>();
    s.set("name", name);
    s.set("order", generateKeyBetween(last, null));
    s.set("visibility", "everyone");
    s.set("doc", new Y.Doc({ guid: sceneGuid(this.id, id) }));
    this.scenes.set(id, s);
    return id;
  }

  /** The scene's subdocument (not yet loaded). Scenes from M0 get one now. */
  sceneSubdoc(id: string): Y.Doc | null {
    const s = this.scenes.get(id);
    if (!s) return null;
    let doc = s.get("doc");
    if (!(doc instanceof Y.Doc)) {
      // The guid is derived from the ids, so two peers doing this at once
      // still end up pointing at the same document.
      doc = new Y.Doc({ guid: sceneGuid(this.id, id) });
      s.set("doc", doc);
    }
    return doc;
  }

  updateScene(id: string, patch: Partial<Omit<SceneView, "id">>) {
    const s = this.scenes.get(id);
    if (!s) return;
    this.doc.transact(() => {
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) s.delete(k);
        else s.set(k, v);
      }
    });
  }

  removeScene(id: string) {
    this.scenes.delete(id);
    // Drop this device's copy of the contents. Peers that still have the
    // scene keep theirs.
    indexedDB.deleteDatabase(sceneDbName(sceneGuid(this.id, id)));
  }

  activeSceneId(): string | null {
    const mine = this.members.get(device.value.id)?.get("activeSceneId");
    if (mine && this.scenes.has(mine)) return mine;
    return this.sceneViews()[0]?.id ?? null;
  }

  setActiveScene(sceneId: string) {
    this.members.get(device.value.id)?.set("activeSceneId", sceneId);
    // Where the GM goes, the table goes: tell everyone once they've settled.
    if (this.isGm()) {
      clearTimeout(this.sceneNoticeTimer);
      this.sceneNoticeTimer = setTimeout(
        () => this.announceScene(),
        Campaign.sceneNoticeDelay,
      );
    }
  }

  /** Move every player to the scene and announce the pull immediately. */
  pullPlayersToScene(sceneId: string) {
    if (!this.isGm() || !this.scenes.has(sceneId)) return;
    this.doc.transact(() => {
      for (const member of this.members.values()) {
        if (member.get("role") === "player")
          member.set("activeSceneId", sceneId);
      }
    });
    this.setActiveScene(sceneId);
    clearTimeout(this.sceneNoticeTimer);
    this.announceScene(true);
  }

  /**
   * How long the GM must stay on a scene before it's announced, so passing
   * through scenes (or clicking one's name to rename it) doesn't flood the
   * chat. Tests shorten it.
   */
  static sceneNoticeDelay = 1500;
  private sceneNoticeTimer: ReturnType<typeof setTimeout> | undefined;

  /** Post "Scene changed to …" unless this scene was the last one announced. */
  private announceScene(force = false) {
    if (this.destroyed) return;
    const id = this.activeSceneId();
    if (!id || (!force && id === this.meta.get("tableScene"))) return;
    this.meta.set("tableScene", id);
    const name =
      this.sceneViews().find((s) => s.id === id)?.name ?? "a new scene";
    const author = {
      id: device.value.id,
      name: this.members.get(device.value.id)?.get("name") ?? "GM",
    };
    this.chat.post(
      {
        kind: "system",
        text: `Scene changed to ${name}`,
        event: "scene-change",
        sceneId: id,
      },
      author,
    );
  }
}

// Lifecycle

export const activeCampaign = signal<Campaign | null>(null)

export async function createCampaign(name: string, gmName: string, systemId = DEFAULT_SYSTEM.id): Promise<string> {
  const id = newId()
  const roomKey = newSecret()
  const system = getSystem(systemId)
  const c = await Campaign.open(id)
  c.doc.transact(() => {
    c.meta.set('name', name)
    c.meta.set('systemId', system.id)
    c.meta.set('systemVersion', system.version)
    c.meta.set('roomKey', roomKey)
    c.meta.set('createdAt', Date.now())
    c.meta.set('createdBy', device.value.id)
    c.ensureMember(gmName, 'gm')
    const first = c.addScene('The Opening Scene')
    // The table starts here; there's nothing to announce.
    c.meta.set('tableScene', first)
    c.setActiveScene(first)
  })
  const now = Date.now()
  upsertCampaign({
    id,
    name,
    systemId: system.id,
    role: 'gm',
    roomKey,
    createdAt: now,
    lastOpenedAt: now,
  })
  c.destroy()
  return id
}

export async function openCampaign(id: string) {
  if (activeCampaign.value?.id === id) return
  closeCampaign()
  const c = await Campaign.open(id)
  const roomKey: string | undefined = summaryOf(id)?.roomKey ?? c.meta.get('roomKey')
  if (!c.meta.has('name') && !roomKey) {
    // Nothing stored locally and no invite to fetch it with.
    c.destroy()
    await deleteLocalCampaign(id)
    throw new Error('it is not stored on this device')
  }
  touchCampaign(id)
  activeCampaign.value = c
  if (roomKey) c.connect(roomKey, { rejoin: rejoining.delete(id) })
}

/**
 * Add a campaign from an invite. It starts empty and fills in when the first
 * peer connects; opening it shows a waiting screen until then.
 */
export function joinCampaign({ campaignId, roomKey }: Invite): string {
  // Opening an invite is how a removed player asks to come back.
  rejoining.add(campaignId)
  if (!summaryOf(campaignId)) {
    const now = Date.now()
    upsertCampaign({
      id: campaignId,
      name: 'Joining…',
      systemId: DEFAULT_SYSTEM.id,
      role: 'player',
      roomKey,
      createdAt: now,
      lastOpenedAt: now,
    })
  }
  return campaignId
}

export function closeCampaign() {
  activeCampaign.value?.destroy()
  activeCampaign.value = null
}

/** Drop this device's GM vault for a campaign, and its pages' text. */
async function deleteVault(id: string) {
  const doc = new Y.Doc()
  const p = new IndexeddbPersistence(vaultDbName(id), doc)
  await p.whenSynced
  for (const noteId of doc.getMap('notes').keys()) indexedDB.deleteDatabase(noteDbName(vaultNoteGuid(id, noteId)))
  await p.clearData()
  doc.destroy()
}

/** Remove a campaign from this device only. Peers keep their copies. */
export async function deleteLocalCampaign(id: string) {
  if (activeCampaign.value?.id === id) closeCampaign()
  const doc = new Y.Doc()
  const p = new IndexeddbPersistence(dbName(id), doc)
  await p.whenSynced
  for (const sceneId of doc.getMap('scenes').keys()) indexedDB.deleteDatabase(sceneDbName(sceneGuid(id, sceneId)))
  for (const noteId of doc.getMap('notes').keys()) indexedDB.deleteDatabase(noteDbName(noteGuid(id, noteId)))
  await deleteVault(id)
  deleteChatData(doc)
  await p.clearData()
  doc.destroy()
  forgetCampaign(id)
}
