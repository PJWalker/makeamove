import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { store } from "../../lib/store";
import { HybridClock } from "../../lib/hlc";
import { newId } from "../../lib/ids";
import { compareCodeUnits } from "../../lib/order";
import { dataName, deleteData } from "../../platform/dataEpoch";
import { device } from "../../platform/device";
import { colourOf } from "../../scene/presence";
import { list, rootOf } from "../../data/schema";
import type { List } from "../../data/schema";
import type { ChatMessage } from "./types";

/*
 * The campaign's chat log, stored as append-only chunks so long campaigns
 * stay fast. The root document holds `chat`, a Y.Array of chunk
 * subdocuments in the order they were started; each chunk holds up to
 * CHUNK_SIZE messages in a Y.Array named `messages`. Only the newest chunks
 * are loaded (and so synced); "Load earlier" pulls in older ones.
 *
 * Messages sort by their HLC stamp, so two peers starting a chunk at once,
 * or posting at once, still agree on the order.
 */

export const CHUNK_SIZE = 500;
/** Chunks loaded when the log opens. */
const INITIAL_CHUNKS = 2;

export const chatDbName = (guid: string) => dataName("chat", guid);

/** Remove this device's copy of every chunk listed in a campaign's chat log. */
export function deleteChatData(chunks: List<Y.Doc>) {
  for (const chunk of chunks.toArray()) deleteData(chatDbName(chunk.guid));
}

/** A chunk of the log: up to CHUNK_SIZE messages, in the order they were posted. */
const chunkShape = { messages: list<ChatMessage>() };

interface LoadedChunk {
  doc: Y.Doc;
  messages: List<ChatMessage>;
  persistence: IndexeddbPersistence;
  stop: () => void;
}

export type NewMessage = ChatMessage extends infer M
  ? M extends ChatMessage
    ? Omit<M, "author" | "colour" | "hlc" | "id" | "name">
    : never
  : never;

export class ChatLog {
  /** Loaded messages, oldest first. */
  readonly messages = store<ChatMessage[]>([]);
  /** Whether older chunks exist that aren't loaded. */
  readonly hasEarlier = store(false);
  /** About how many messages those hold: chunks fill before the next starts, so CHUNK_SIZE each. */
  readonly earlierCount = store(0);

  private readonly chunks: List<Y.Doc>;
  private readonly loaded = new Map<string, LoadedChunk>();
  private readonly clock: HybridClock;
  private readonly campaignId: string;
  /** Index in `chunks` of the oldest chunk to keep loaded. */
  private from = Infinity;
  private destroyed = false;
  private readonly stopRoot: () => void;
  /** Posts not yet written, so they go in one at a time, in order. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(chunks: List<Y.Doc>, campaignId: string, deviceId: string) {
    this.chunks = chunks;
    this.campaignId = campaignId;
    this.clock = new HybridClock(deviceId);
    // New chunks (ours or a peer's) are always loaded; they're the newest.
    const onChunks = () =>
      void this.loadFrom(Math.min(this.from, Math.max(0, this.chunks.length - INITIAL_CHUNKS)));
    this.stopRoot = this.chunks.observe(onChunks);
  }

  /** Load the newest chunks. */
  async start() {
    await this.loadFrom(Math.max(0, this.chunks.length - INITIAL_CHUNKS));
  }

  /** Load the chunk before the oldest one loaded. */
  async loadEarlier() {
    if (this.from > 0) await this.loadFrom(this.from - 1);
  }

  private async loadFrom(index: number) {
    this.from = Math.min(this.from, index);
    this.hasEarlier.value = this.from > 0;
    this.earlierCount.value = this.from * CHUNK_SIZE;
    const waits: Promise<unknown>[] = [];
    for (const [index_, document] of this.chunks.toArray().entries()) {
      if (index_ >= this.from && !this.loaded.has(document.guid))
        waits.push(this.loadChunk(document));
    }
    await Promise.all(waits);
  }

  private async loadChunk(document: Y.Doc) {
    if (this.destroyed) return;
    document.load();
    const { messages } = rootOf(document, chunkShape);
    const persistence = new IndexeddbPersistence(chatDbName(document.guid), document);
    this.loaded.set(document.guid, {
      doc: document,
      messages,
      persistence,
      stop: messages.observe(() => {
        this.refresh();
      }),
    });
    await persistence.whenSynced;
    this.refresh();
  }

  private refresh() {
    const all: ChatMessage[] = [];
    for (const { messages } of this.loaded.values()) all.push(...messages.toArray());
    all.sort((a, b) => compareCodeUnits(a.hlc, b.hlc));
    // Later local stamps must sort after everything seen.
    const last = all.at(-1);
    if (last) this.clock.receive(last.hlc);
    this.messages.value = all;
  }

  /** The chunk new messages go into, starting one if needed. */
  private async currentChunk(): Promise<LoadedChunk> {
    const last = this.chunks.at(-1) ?? null;
    if (last) {
      if (!this.loaded.has(last.guid)) await this.loadChunk(last);
      const chunk = this.loaded.get(last.guid)!;
      if (chunk.messages.length < CHUNK_SIZE) return chunk;
    }
    const document = new Y.Doc({ guid: `${this.campaignId}/chat/${newId()}` });
    this.chunks.push(document);
    // The chunks observer starts loading it; wait for that to finish.
    await this.loadFrom(this.chunks.length - 1);
    return this.loaded.get(document.guid)!;
  }

  /** Append a message from this device. Posts go one at a time, in order. */
  post(
    message: NewMessage,
    author: { id: string; name: string },
    id?: string,
  ): Promise<ChatMessage> {
    const next = this.queue.then(async () => {
      const chunk = await this.currentChunk();
      const full = {
        ...message,
        id: id ?? newId(),
        hlc: this.clock.tick(),
        author: author.id,
        name: author.name,
        colour: colourOf(device.value),
      } as ChatMessage;
      chunk.messages.push(full);
      return full;
    });
    this.queue = next.catch(() => {});
    return next;
  }

  /**
   * Delete a message from the shared log, for everyone. Callers check who may
   * (see canDelete); like other GM rules this is enforced in the UI only.
   */
  remove(id: string): boolean {
    for (const { messages } of this.loaded.values()) {
      const index = messages.toArray().findIndex((m) => m.id === id);
      if (index !== -1) {
        messages.delete(index);
        return true;
      }
    }
    return false;
  }

  destroy() {
    this.destroyed = true;
    this.stopRoot();
    for (const c of this.loaded.values()) {
      c.stop();
      void c.persistence.destroy();
    }
    this.loaded.clear();
  }
}
