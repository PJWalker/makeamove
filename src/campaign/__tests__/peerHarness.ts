import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { expect } from "vite-plus/test";
import * as Y from "yjs";
import { store, type Store } from "../../lib/store";
import { device, type Device } from "../../platform/device";
import { MemoryNetwork } from "../../sync/__tests__/memoryRoom";
import { Campaign, createCampaign } from "../campaign";

/*
 * Several devices playing one campaign in a single test, over an in-memory
 * network. Each peer is a real Campaign with its own identity and its own
 * IndexedDB, so peers only learn about each other through sync.
 *
 *   const h = new PeerHarness();
 *   const gm = await h.create("gm", "Gwen", "The Lost Barrows");
 *   const pat = await h.join("pat", "Pat");
 *   gm.do((c) => c.addScene("The Bog"));
 *   await h.settle();
 *   h.expectConverged();
 *
 * Much of the app reads the global `device` and `indexedDB`, so the harness
 * points them at a peer while it acts (`do`) and while each message is
 * delivered to it. Drive peers one at a time: await each action before the
 * next, and settle before asserting.
 */

/** The IndexedDB of whichever peer is acting. */
let storage: IDBFactory = globalThis.indexedDB;
globalThis.indexedDB = {
  open: (...args) => storage.open(...args),
  deleteDatabase: (name) => storage.deleteDatabase(name),
  databases: () => storage.databases(),
  cmp: (a, b) => storage.cmp(a, b),
} satisfies IDBFactory;

/** A small seeded generator (mulberry32), for reproducible delivery orders. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

export interface PeerHarnessOptions {
  /** Deliver messages in a shuffled order from this seed, rather than in the order sent. */
  seed?: number;
}

export class Peer {
  readonly identity: Store<Device>;
  readonly storage = new IDBFactory();
  private open: Campaign | null = null;

  constructor(
    readonly harness: PeerHarness,
    readonly id: string,
    name: string,
  ) {
    this.identity = store<Device>({ id, name });
  }

  get campaign(): Campaign {
    if (!this.open) throw new Error(`${this.id} has no campaign open`);
    return this.open;
  }

  get connected() {
    return !!this.open?.sync;
  }

  /** Make this peer the device acting, for code that reads the global device or IndexedDB. */
  enter() {
    device.value = this.identity.value;
    storage = this.storage;
  }

  /** Act as this peer on its campaign. */
  do<T>(act: (campaign: Campaign) => T): T {
    this.enter();
    return act(this.campaign);
  }

  /** Open the campaign from this peer's storage, and connect. */
  async start() {
    await this.openCampaign();
    await this.connect();
  }

  async openCampaign() {
    this.enter();
    this.open = await Campaign.open(this.harness.campaignId, {
      device: this.identity,
      joinRoom: this.harness.network.joinAs(this.id),
    });
  }

  async connect() {
    this.enter();
    await this.campaign.connect(this.harness.roomKey);
  }

  /** Go offline, keeping the campaign open locally. */
  disconnect() {
    this.do((c) => c.disconnect());
  }

  /** Close the campaign, as when the app is closed. */
  stop() {
    this.enter();
    this.open?.destroy();
    this.open = null;
  }

  /** Close and reopen the campaign from storage, as when the app is reloaded. */
  async restart() {
    this.stop();
    await this.start();
  }

  /** The campaign's root document as plain data, with subdocuments as `{ subdoc: guid }`. */
  state() {
    return docState(this.campaign.doc);
  }

  /** Subdocuments this peer has open, by guid. */
  openSubdocs(): Map<string, Y.Doc> {
    return new Map(
      [...this.campaign.doc.getSubdocs()].filter((d) => d.shouldLoad).map((d) => [d.guid, d]),
    );
  }
}

export class PeerHarness {
  readonly network: MemoryNetwork;
  readonly peers = new Map<string, Peer>();
  campaignId = "";
  roomKey = "";

  constructor({ seed }: PeerHarnessOptions = {}) {
    const next = seed === undefined ? null : random(seed);
    this.network = new MemoryNetwork({
      deliverTo: (member, deliver) => {
        this.peers.get(member)?.enter();
        deliver();
      },
      ...(next && { pick: (pending: number) => Math.floor(next() * pending) }),
    });
  }

  /** A GM creates the campaign and goes online with it. */
  async create(id: string, name: string, campaignName: string, systemId?: string): Promise<Peer> {
    if (this.campaignId) throw new Error("the harness already has a campaign");
    const peer = new Peer(this, id, name);
    this.peers.set(id, peer);
    peer.enter();
    this.campaignId = await createCampaign(campaignName, name, systemId);
    await peer.openCampaign();
    this.roomKey = peer.campaign.meta.get("roomKey") as string;
    await peer.connect();
    return peer;
  }

  /** A device joins by invite: it starts empty and fills in from its peers. */
  async join(id: string, name: string): Promise<Peer> {
    if (!this.campaignId) throw new Error("create the campaign before joining it");
    const peer = new Peer(this, id, name);
    this.peers.set(id, peer);
    await peer.start();
    await this.settle();
    return peer;
  }

  peer(id: string): Peer {
    const peer = this.peers.get(id);
    if (!peer) throw new Error(`no peer ${id}`);
    return peer;
  }

  /**
   * Deliver every message, including those delivery causes, and let storage
   * and other async work finish, until the network has been quiet for a few
   * turns of the event loop.
   */
  async settle({ quietTurns = 3, maxTurns = 1000 } = {}) {
    let quiet = 0;
    for (let turn = 0; turn < maxTurns; turn++) {
      if (this.network.pending) {
        quiet = 0;
        for (const room of this.network.rooms.values()) await room.settle();
      } else if (++quiet >= quietTurns) return;
      await tick();
    }
    throw new Error(`the network did not settle within ${maxTurns} turns`);
  }

  /** Deliver a single message per room, to interleave actions with delivery. */
  step() {
    this.network.step();
  }

  /**
   * Assert that the peers (connected ones by default) hold the same campaign:
   * the same root document, the same contents in each subdocument that more
   * than one of them has open, and the same idea of who's online. Returns the
   * root state they share.
   */
  expectConverged(peers = [...this.peers.values()].filter((p) => p.connected)) {
    const [first, ...rest] = peers;
    if (!first) throw new Error("no peers to compare");
    const expected = first.state();
    for (const p of rest)
      expect(p.state(), `${p.id}'s campaign, against ${first.id}'s`).toEqual(expected);

    const open = new Map<string, { peer: Peer; doc: Y.Doc }[]>();
    for (const peer of peers)
      for (const [guid, doc] of peer.openSubdocs())
        open.set(guid, [...(open.get(guid) ?? []), { peer, doc }]);
    for (const [guid, [head, ...others]] of open)
      for (const other of others)
        expect(
          docState(other.doc),
          `${guid} on ${other.peer.id}, against ${head!.peer.id}`,
        ).toEqual(docState(head!.doc));

    const online = [...first.campaign.online.value].sort();
    for (const p of rest)
      expect([...p.campaign.online.value].sort(), `who ${p.id} sees online`).toEqual(online);
    return expected;
  }

  destroy() {
    for (const peer of this.peers.values()) peer.stop();
    this.peers.clear();
  }
}

/** A document's shared types as plain data, in a stable order. */
export function docState(doc: Y.Doc): Record<string, unknown> {
  return Object.fromEntries(
    [...doc.share]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([name, type]) => [
        name,
        // A root type received but never read on this device has no kind yet; read it as a map.
        plain(type.constructor === Y.AbstractType ? doc.getMap(name) : type),
      ]),
  );
}

function plain(value: unknown): unknown {
  if (value instanceof Y.Doc) return { subdoc: value.guid };
  if (value instanceof Y.Map)
    return Object.fromEntries(
      [...(value as Y.Map<unknown>).entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([k, v]) => [k, plain(v)]),
    );
  if (value instanceof Y.Array) return (value as Y.Array<unknown>).toArray().map(plain);
  // Rich text (notes, sheets) as its XML.
  if (value instanceof Y.XmlFragment || value instanceof Y.XmlText) return value.toJSON();
  if (value instanceof Y.Text) return value.toDelta();
  return value;
}
