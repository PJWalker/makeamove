import { store, watch } from "../lib/store";
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { newId, newSecret } from "../lib/ids";
import { campaignDbName, campaignUiDbName } from "./storage";

import { commaListOf, formatCommaList } from "../lib/list";
import { device, type Device } from "../platform/device";
import { joinPublicRoom, type JoinRoom } from "../sync/transport";
import type { ReadonlyStore } from "../lib/store";
import {
  forgetCampaign,
  renameCampaignEntry,
  summaryOf,
  touchCampaign,
  updateCampaignEntry,
  upsertCampaign,
} from "./registry";
import { NO_SYSTEM_ID, getSystem } from "../systems";
import type { Invite } from "../sync/invite";
import { CampaignConnection } from "./connection";
import { noteDbName, noteGuid } from "../features/notes/noteDoc";
import { deleteNoteTextIndex } from "../features/notes/textIndex";
import { Vault, vaultDbName, vaultNoteGuid, vaultShape } from "../features/notes/vault";
import { ChatLog, deleteChatData } from "../features/chat/chatLog";
import { MoveRequests } from "../features/characters/moveRequests";
import { sceneDbName } from "../scene/sceneDoc";
import { upgrade } from "../data/migrate";
import { rootOf } from "../data/schema";
import { campaignShape, type CampaignRoot } from "./schema";
import { SystemData } from "./systemStore";
import {
  activeSceneId as activeSceneIdFromIndex,
  createScene,
  removeScene,
  sceneGuid,
  sceneSubdoc,
  sceneViews,
  updateScene,
} from "./sceneIndex";
import type { CampaignDefaults, MemberView, RevokedView, Role, SceneView } from "./types";
export type { CampaignDefaults, MemberView, RevokedView, Role, SceneView } from "./types";

/* An open campaign: its root document (laid out in schema.ts), sync and services. */

/**
 * How long a device the GM removed stays connected after rejoining by invite,
 * to hear whether the GM has let it back in.
 */
const REJOIN_CHECK_MS = 5000;

/** Campaigns being rejoined by invite link; see Campaign.connect. */
const rejoining = new Set<string>();

/** The system an invite assumes until the campaign arrives from a peer. */
const DEFAULT_SYSTEM = getSystem(NO_SYSTEM_ID);
/** Canvas colour for an auto scene with no map yet. */
export const DEFAULT_CANVAS_COLOUR = "#2b3a55";

/** The device a campaign is opened on and how it reaches peers; the app's own by default. */
export interface CampaignHost {
  device?: ReadonlyStore<Device>;
  joinRoom?: JoinRoom;
}

export class Campaign {
  readonly id: string;
  readonly doc: Y.Doc;
  readonly root: CampaignRoot;
  readonly meta: CampaignRoot["meta"];
  readonly members: CampaignRoot["members"];
  /** deviceId -> { name, at, by } for each player the GM removed. */
  readonly revoked: CampaignRoot["revoked"];
  readonly scenes: CampaignRoot["scenes"];
  /** id -> folder that scenes are filed in. */
  readonly sceneFolders: CampaignRoot["sceneFolders"];
  /** id -> character (see characters/schema.ts). */
  readonly characters: CampaignRoot["characters"];
  /** id -> folder that characters can be filed in. */
  readonly characterFolders: CampaignRoot["characterFolders"];
  /** id -> note page; its text is in a subdocument (see notes/noteDoc.ts). */
  readonly notes: CampaignRoot["notes"];
  /** id -> folder that notes are filed in. */
  readonly noteFolders: CampaignRoot["noteFolders"];
  /** Roll-request answers, applied damage, edits and pins, by message (see chat/messageState.ts). */
  readonly messageState: CampaignRoot["messageState"];
  /** The turn tracker: round and whose turn, and who's in the fight (see combat/combat.ts). */
  readonly combat: CampaignRoot["combat"];
  readonly combatants: CampaignRoot["combatants"];
  /** Gear and moves made at the table (see homebrew/homebrew.ts). */
  readonly homebrew: CampaignRoot["homebrew"];
  /** One custom graphic per entity, shared by lists, windows and scene drops. */
  readonly entityGraphics: CampaignRoot["entityGraphics"];
  /** What the campaign's system keeps campaign-wide. */
  readonly systemData: SystemData;
  /** GM-only pages, on GM devices only (see notes/vault.ts). */
  readonly vault = store<Vault | null>(null);
  private persistence: IndexeddbPersistence;
  private destroyed = false;
  private rejoinCleanups: (() => void)[] = [];
  readonly connection: CampaignConnection;

  /** False while joining by invite, until the first peer has sent the campaign. */
  /** Cursors, pings and rulers; live only while peers are connected. */
  readonly ready = store(false);

  get presence() {
    return this.connection.presence;
  }
  get peerCount() {
    return this.connection.peerCount;
  }
  get online() {
    return this.connection.online;
  }

  /** The device this campaign is open on. */
  readonly device: ReadonlyStore<Device>;
  private readonly joinRoom: JoinRoom;

  private constructor(id: string, host: CampaignHost) {
    this.id = id;
    this.device = host.device ?? device;
    this.joinRoom = host.joinRoom ?? joinPublicRoom;
    this.doc = new Y.Doc({ guid: id });
    this.root = rootOf(this.doc, campaignShape);
    ({
      meta: this.meta,
      members: this.members,
      revoked: this.revoked,
      scenes: this.scenes,
      sceneFolders: this.sceneFolders,
      characters: this.characters,
      characterFolders: this.characterFolders,
      notes: this.notes,
      noteFolders: this.noteFolders,
      messageState: this.messageState,
      combat: this.combat,
      combatants: this.combatants,
      homebrew: this.homebrew,
      entityGraphics: this.entityGraphics,
    } = this.root);
    this.systemData = new SystemData(this.root.ext, () => this.systemId);
    this.persistence = new IndexeddbPersistence(campaignDbName(id), this.doc);
    this.chat = new ChatLog(this.root.chat, id, this.device.value.id);
    this.connection = new CampaignConnection(id, this.doc, this.device, this.joinRoom);
  }

  /** Chat, rolls and the move log (see chat/chatLog.ts). */
  readonly chat: ChatLog;
  /** The move this device is part-way through making (see characters/moveFlow.ts). */
  readonly moves = new MoveRequests();

  static async open(id: string, host: CampaignHost = {}): Promise<Campaign> {
    const c = new Campaign(id, host);
    open.add(c);
    await c.persistence.whenSynced;
    c.watchMeta();
    c.upgradeSystemData();
    await c.chat.start();
    if (c.isGm()) c.vault.value = await Vault.open(id, c.joinRoom);
    return c;
  }

  /** Bring the system's data, campaign-wide and on each character, up to its schema version. */
  private upgradeSystemData() {
    const system = getSystem(this.systemId);
    const version = system.schemaVersion ?? 1;
    const campaignData = this.root.ext.get(system.id);
    if (campaignData) upgrade(campaignData, version, system.migrateCampaign);
    for (const m of this.characters.values()) {
      const data = m.get("ext")?.get(system.id);
      if (data) upgrade(data, version, system.migrateCharacter);
    }
  }

  /** Track readiness and keep this device's list entry and membership current. */
  private watchMeta() {
    this.checkMembership = () => {
      const named = this.meta.has("name");
      const removed = this.revoked.has(this.device.value.id);
      // A removed player's device must not add itself back.
      if (named && !removed && !this.members.has(this.device.value.id)) {
        const name = this.device.value.name || "Player";
        this.ensureMember(name);
        void this.chat.post(
          { kind: "system", text: `${name} joined`, event: "join" },
          { id: this.device.value.id, name },
        );
      }
      if (named)
        updateCampaignEntry(this.id, {
          name: this.name,
          systemId: this.systemId,
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
  readonly removed = store(false);
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
      const stop = watch([this.peerCount], () => {
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

  /** Close the campaign here: leave the room and close its documents. Safe to call twice. */
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    open.delete(this);
    clearTimeout(this.sceneNoticeTimer);
    this.disconnect();
    this.chat.destroy();
    this.vault.value?.destroy();
    void this.persistence.destroy();
    this.doc.destroy();
  }

  /** The id of the system this campaign plays. */
  get systemId(): string {
    return this.meta.get("systemId") ?? DEFAULT_SYSTEM.id;
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
      tokenStyle: this.meta.get("defaultTokenStyle"),
      gridType: this.meta.get("defaultGridType"),
    };
  }

  setDefaults(patch: Partial<CampaignDefaults>) {
    this.meta.patch({ defaultTokenStyle: patch.tokenStyle, defaultGridType: patch.gridType });
  }

  /** Run `fn` as one transaction on the campaign document, tagged with `origin` (see kernel/commands.ts). */
  transact<T>(fn: () => T, origin: object | null = null): T {
    return this.doc.transact(fn, origin);
  }

  isGm(deviceId = this.device.value.id): boolean {
    return this.members.get(deviceId)?.get("role") === "gm";
  }

  // Members

  memberViews(): MemberView[] {
    return this.members.entries().map(([id, m]) => ({
      id,
      name: m.get("name") ?? "Unnamed",
      role: m.get("role"),
      activeSceneId: m.get("activeSceneId") ?? null,
      playing: m.get("playing") ?? null,
    }));
  }

  revokedViews(): RevokedView[] {
    return this.revoked
      .entries()
      .map(([id, r]) => ({ id, name: r.name, at: r.at }))
      .sort((a, b) => b.at - a.at);
  }

  /**
   * Remove a player: they leave the member list, and their device
   * stops syncing and won't add itself back. Like the GM's other controls
   * this relies on clients playing fair; anyone keeping the room key could
   * still connect with a modified client.
   */
  revokeMember(id: string) {
    const m = this.members.get(id);
    if (id === this.device.value.id || !m || m.get("role") === "gm") return;
    this.doc.transact(() => {
      this.revoked.set(id, {
        name: m.get("name") ?? "Unnamed",
        at: Date.now(),
        by: this.device.value.id,
      });
      this.members.delete(id);
    });
  }

  /** Let a removed player back in; they rejoin with the invite link. */
  allowBack(id: string) {
    this.revoked.delete(id);
  }

  ensureMember(name: string, role: Role = "player") {
    const id = this.device.value.id;
    this.doc.transact(() => {
      if (!this.members.has(id)) this.members.set(id, { role, joinedAt: Date.now() });
      if (name) this.members.get(id)?.patch({ name });
    });
  }

  // Scenes

  sceneViews(): SceneView[] {
    return sceneViews(this.scenes);
  }

  addScene(name: string): string {
    return createScene(this.id, this.scenes, name);
  }

  /** The scene's subdocument (not yet loaded). Scenes from M0 get one now. */
  sceneSubdoc(id: string): Y.Doc | null {
    return sceneSubdoc(this.id, this.scenes, id);
  }

  updateScene(id: string, patch: Partial<Omit<SceneView, "id">>) {
    updateScene(this.scenes, id, patch);
  }

  removeScene(id: string) {
    removeScene(this.id, this.scenes, id);
  }

  activeSceneId(): string | null {
    return activeSceneIdFromIndex(this.members, this.scenes, this.device.value.id);
  }

  setActiveScene(sceneId: string) {
    this.members.get(this.device.value.id)?.set("activeSceneId", sceneId);
    // Where the GM goes, the table goes: tell everyone once they've settled.
    if (this.isGm()) {
      clearTimeout(this.sceneNoticeTimer);
      this.sceneNoticeTimer = setTimeout(() => this.announceScene(), Campaign.sceneNoticeDelay);
    }
  }

  /** Move every player to the scene and announce the pull immediately. */
  pullPlayersToScene(sceneId: string) {
    if (!this.scenes.has(sceneId)) return;
    this.doc.transact(() => {
      for (const member of this.members.values()) {
        if (member.get("role") === "player") member.set("activeSceneId", sceneId);
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
    const id = activeSceneIdFromIndex(this.members, this.scenes, this.device.value.id);
    if (!id || (!force && id === this.meta.get("tableScene"))) return;
    this.meta.set("tableScene", id);
    const name = sceneViews(this.scenes).find((s) => s.id === id)?.name ?? "a new scene";
    const author = {
      id: this.device.value.id,
      name: this.members.get(this.device.value.id)?.get("name") ?? "GM",
    };
    void this.chat.post(
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

/** The campaigns open in this page. */
const open = new Set<Campaign>();
export const openCampaigns: ReadonlySet<Campaign> = open;

export async function createCampaign(
  name: string,
  gmName: string,
  systemId = DEFAULT_SYSTEM.id,
): Promise<string> {
  const id = newId();
  const roomKey = newSecret();
  const system = getSystem(systemId);
  const c = await Campaign.open(id);
  c.doc.transact(() => {
    c.meta.set("name", name);
    c.meta.set("systemId", system.id);
    c.meta.set("systemVersion", system.version);
    c.root.ext.set(system.id, { schemaVersion: system.schemaVersion ?? 1 });
    for (const field of system.campaignFields ?? []) c.systemData.setValue(field.id, field.default);
    c.meta.set("roomKey", roomKey);
    c.meta.set("createdAt", Date.now());
    c.meta.set("createdBy", device.value.id);
    c.ensureMember(gmName, "gm");
    const first = c.addScene("The Opening Scene");
    // The table starts here; there's nothing to announce.
    c.meta.set("tableScene", first);
    c.setActiveScene(first);
  });
  const now = Date.now();
  upsertCampaign({
    id,
    name,
    systemId: system.id,
    role: "gm",
    roomKey,
    createdAt: now,
    lastOpenedAt: now,
  });
  c.destroy();
  return id;
}

/** Resolve a system's campaign-level values, falling back for older stored campaigns. */
export function systemCampaignData(campaign: Campaign): Record<string, string | number | boolean> {
  const system = getSystem(campaign.systemId);
  return Object.fromEntries(
    (system.campaignFields ?? []).map((field) => [
      field.id,
      campaign.systemData.value(field.id) ?? field.default,
    ]),
  );
}

/** Change one declared shared system field. Only the GM may edit campaign state. */
export function setSystemCampaignData(
  campaign: Campaign,
  fieldId: string,
  value: string | number | boolean,
) {
  const field = getSystem(campaign.systemId).campaignFields?.find(
    (candidate) => candidate.id === fieldId,
  );
  if (!field) return;
  if (field.type === "number") {
    const number = Number(value);
    if (
      !Number.isFinite(number) ||
      !Number.isInteger(number) ||
      (field.min !== undefined && number < field.min) ||
      (field.max !== undefined && number > field.max)
    )
      return;
    campaign.systemData.setValue(fieldId, number);
    return;
  }
  if (field.type === "select" && !field.options?.some((option) => option.id === value)) return;
  if (field.type === "multiselect") {
    const values = commaListOf(value);
    if (values.some((id) => !field.options?.some((option) => option.id === id))) return;
    campaign.systemData.setValue(fieldId, formatCommaList([...new Set(values)]));
    return;
  }
  if (field.type === "text" && typeof value !== "string") return;
  campaign.systemData.setValue(fieldId, value);
}

/** Open a stored (or joined) campaign and start syncing it; the caller destroys it when done. */
export async function openCampaign(id: string, host: CampaignHost = {}): Promise<Campaign> {
  const c = await Campaign.open(id, host);
  const roomKey = summaryOf(id)?.roomKey ?? c.meta.get("roomKey");
  if (!c.meta.has("name") && !roomKey) {
    // Nothing stored locally and no invite to fetch it with.
    c.destroy();
    await deleteLocalCampaign(id);
    throw new Error("it is not stored on this device");
  }
  touchCampaign(id);
  if (roomKey) void c.connect(roomKey, { rejoin: rejoining.delete(id) });
  return c;
}

/**
 * Add a campaign from an invite. It starts empty and fills in when the first
 * peer connects; opening it shows a waiting screen until then.
 */
export function joinCampaign({ campaignId, roomKey }: Invite): string {
  // Opening an invite is how a removed player asks to come back.
  rejoining.add(campaignId);
  if (!summaryOf(campaignId)) {
    const now = Date.now();
    upsertCampaign({
      id: campaignId,
      name: "Joining…",
      systemId: DEFAULT_SYSTEM.id,
      role: "player",
      roomKey,
      createdAt: now,
      lastOpenedAt: now,
    });
  }
  return campaignId;
}

/** Drop this device's GM vault for a campaign, and its pages' text. */
async function deleteVault(id: string) {
  const doc = new Y.Doc();
  const p = new IndexeddbPersistence(vaultDbName(id), doc);
  await p.whenSynced;
  for (const noteId of rootOf(doc, vaultShape).notes.keys())
    indexedDB.deleteDatabase(noteDbName(vaultNoteGuid(id, noteId)));
  await p.clearData();
  doc.destroy();
}

/** Remove a campaign from this device only. Peers keep their copies. */
export async function deleteLocalCampaign(id: string) {
  for (const c of open) if (c.id === id) c.destroy();
  const doc = new Y.Doc();
  const p = new IndexeddbPersistence(campaignDbName(id), doc);
  await p.whenSynced;
  const root = rootOf(doc, campaignShape);
  for (const sceneId of root.scenes.keys())
    indexedDB.deleteDatabase(sceneDbName(sceneGuid(id, sceneId)));
  for (const noteId of root.notes.keys())
    indexedDB.deleteDatabase(noteDbName(noteGuid(id, noteId)));
  await deleteVault(id);
  await deleteNoteTextIndex(id);
  indexedDB.deleteDatabase(campaignUiDbName(id));
  deleteChatData(root.chat);
  await p.clearData();
  doc.destroy();
  forgetCampaign(id);
}
