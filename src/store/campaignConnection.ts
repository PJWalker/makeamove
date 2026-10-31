import { effect, signal } from "@preact/signals";
import * as Y from "yjs";
import { colourOf, Presence } from "../scene/presence";
import { setBlobFetcher } from "../scene/images";
import { BlobExchange } from "../sync/blobs";
import { SyncSession } from "../sync/session";
import { device } from "./device";
import { getBlob, putBlob } from "./blobs";

export class CampaignConnection {
  readonly presence = new Presence();
  readonly peerCount = signal(0);
  readonly online = signal<ReadonlySet<string>>(new Set());
  private cleanups: (() => void)[] = [];
  private session: SyncSession | null = null;
  private blobs: BlobExchange | null = null;
  private fetcher: ((hash: string) => Promise<Blob | null>) | null = null;

  constructor(
    private readonly id: string,
    private readonly doc: Y.Doc,
  ) {}

  async connect(roomKey: string, isDestroyed: () => boolean): Promise<boolean> {
    if (this.session) return false;
    let transport;
    try {
      transport = (await import("../sync/trystero")).trysteroTransport(
        this.id,
        roomKey,
      );
    } catch {
      return false;
    }
    if (isDestroyed()) {
      transport.close();
      return false;
    }

    const session = new SyncSession(this.doc, transport);
    this.session = session;
    const refresh = () => {
      this.peerCount.value = session.peerIds().length;
      const ids = new Set<string>([device.value.id]);
      for (const state of session.awareness.getStates().values())
        if (state.user?.id) ids.add(state.user.id);
      this.online.value = ids;
    };
    this.blobs = new BlobExchange(session, { get: getBlob, put: putBlob });
    const exchange = this.blobs;
    this.fetcher = (hash) => exchange.fetch(hash);
    setBlobFetcher(this.fetcher);
    this.presence.attach(session.awareness);
    session.onChange = refresh;
    const stopIdentity = effect(() => {
      const currentDevice = device.value;
      session.awareness.setLocalStateField("user", {
        id: currentDevice.id,
        name: currentDevice.name,
        colour: colourOf(currentDevice),
      });
    });
    this.cleanups.push(stopIdentity);
    refresh();
    return true;
  }

  get sync(): SyncSession | null {
    return this.session;
  }

  disconnect() {
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups = [];
    if (this.fetcher) setBlobFetcher(null, this.fetcher);
    this.fetcher = null;
    this.presence.detach();
    this.blobs?.close();
    this.blobs = null;
    this.session?.destroy();
    this.session = null;
    this.peerCount.value = 0;
    this.online.value = new Set([device.value.id]);
  }
}
