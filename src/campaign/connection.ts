import { store, watch, type ReadonlyStore } from "../lib/store";
import * as Y from "yjs";
import { colourOf, Presence } from "../scene/presence";
import { PeerBlobs } from "../media/images";
import { BlobExchange } from "../sync/blobs";
import { SyncSession } from "../sync/session";
import type { Device } from "../platform/device";
import type { JoinRoom } from "../sync/transport";
import { getBlob, putBlob } from "../platform/blobs";

export class CampaignConnection {
  readonly presence = new Presence();
  readonly peerCount = store(0);
  readonly online = store<ReadonlySet<string>>(new Set());
  /** Images this device lacks, fetched from peers while connected. */
  readonly peerBlobs = new PeerBlobs();
  private cleanups: (() => void)[] = [];
  private session: SyncSession | null = null;
  private blobs: BlobExchange | null = null;

  constructor(
    private readonly id: string,
    private readonly doc: Y.Doc,
    private readonly device: ReadonlyStore<Device>,
    private readonly joinRoom: JoinRoom,
  ) {}

  async connect(roomKey: string, isDestroyed: () => boolean): Promise<boolean> {
    if (this.session) return false;
    let transport;
    try {
      transport = await this.joinRoom(this.id, roomKey);
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
      const ids = new Set<string>([this.device.value.id]);
      for (const state of session.awareness.getStates().values()) {
        const user = state.user as { id?: string } | undefined;
        if (user?.id) ids.add(user.id);
      }
      this.online.value = ids;
    };
    this.blobs = new BlobExchange(session, { get: getBlob, put: putBlob });
    const exchange = this.blobs;
    this.peerBlobs.connect((hash) => exchange.fetch(hash));
    this.presence.attach(session.awareness);
    session.onChange = refresh;
    const stopIdentity = watch([this.device], () => {
      const currentDevice = this.device.value;
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
    this.peerBlobs.connect(null);
    this.presence.detach();
    this.blobs?.close();
    this.blobs = null;
    this.session?.destroy();
    this.session = null;
    this.peerCount.value = 0;
    this.online.value = new Set([this.device.value.id]);
  }
}
