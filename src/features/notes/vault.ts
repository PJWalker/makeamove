import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { isString } from "../../lib/guards";
import { collection, lww, record, rootOf, text } from "../../data/schema";
import type { Root } from "../../data/schema";
import { newSecret } from "../../lib/ids";
import { dataName } from "../../platform/dataEpoch";
import SyncSession from "../../sync/session";
import type { JoinRoom } from "../../sync/transport";
import joinPublicRoom from "../../sync/publicRoom";
import { shadowShape } from "../shadow/schema";
import type { ShadowStore } from "../shadow/schema";
import { noteEntry } from "./schema";

/*
 * The GM vault: a document of its own for GM-only pages, kept apart from the
 * campaign so it never reaches players' devices. It is stored only on GM
 * devices and syncs over a room of its own, keyed by a secret that lives in
 * the vault itself (never in the campaign), so only devices that already
 * hold the vault can find each other.
 *
 * A vault page's text is a subdocument of the vault, like a shared page's is
 * of the campaign root.
 */

export const vaultDbName = (campaignId: string) => dataName("vault", campaignId);
export const vaultGuid = (campaignId: string) => `${campaignId}/vault`;
/** Its own guid, so a page revealed later doesn't collide with its vault copy. */
export const vaultNoteGuid = (campaignId: string, noteId: string) =>
  `${campaignId}/gm-note/${noteId}`;

export const vaultShape = {
  meta: record({
    /** The secret to the vault's room. */
    key: lww(isString),
  }),
  /** GM-only pages, indexed like the campaign's. */
  notes: collection(noteEntry, "GM-only note"),
  /** `characterId/field` -> a character's GM-only rich text. */
  characterText: collection(text()),
  /** The GM shadow's memory (shadow/schema.ts). */
  ...shadowShape,
};

export class Vault {
  readonly doc: Y.Doc;
  readonly meta: Root<typeof vaultShape>["meta"];
  readonly notes: Root<typeof vaultShape>["notes"];
  readonly characterText: Root<typeof vaultShape>["characterText"];
  /** The GM shadow's memory. */
  readonly shadow: ShadowStore;
  private readonly persistence: IndexeddbPersistence;
  private session: SyncSession | null = null;
  private destroyed = false;

  private constructor(
    readonly campaignId: string,
    private readonly joinRoom: JoinRoom,
  ) {
    this.doc = new Y.Doc({ guid: vaultGuid(campaignId) });
    const root = rootOf(this.doc, vaultShape);
    ({ meta: this.meta, notes: this.notes, characterText: this.characterText } = root);
    this.shadow = {
      shadowState: root.shadowState,
      shadowLog: root.shadowLog,
      shadowFacts: root.shadowFacts,
      shadowThreads: root.shadowThreads,
      shadowIdeas: root.shadowIdeas,
    };
    this.persistence = new IndexeddbPersistence(vaultDbName(campaignId), this.doc);
  }

  static async open(campaignId: string, joinRoom: JoinRoom = joinPublicRoom): Promise<Vault> {
    const v = new Vault(campaignId, joinRoom);
    await v.persistence.whenSynced;
    if (!v.meta.has("key")) v.meta.set("key", newSecret());
    return v;
  }

  /** The secret to the vault's room. */
  get key(): string {
    return this.meta.get("key")!;
  }

  /** Sync with the campaign's other GM devices, if any are around. */
  async connect() {
    if (this.session || this.destroyed) return;
    let transport;
    try {
      transport = await this.joinRoom(vaultGuid(this.campaignId), this.key);
    } catch {
      // Offline or blocked: the vault still works on this device.
      return;
    }
    if (this.destroyed || this.session) {
      transport.close();
      return;
    }
    this.session = new SyncSession(this.doc, transport);
  }

  /** The connection to the campaign's other GM devices, while there is one. */
  get sync(): SyncSession | null {
    return this.session;
  }

  disconnect() {
    this.session?.destroy();
    this.session = null;
  }

  destroy() {
    this.destroyed = true;
    this.disconnect();
    void this.persistence.destroy();
    this.doc.destroy();
  }
}
