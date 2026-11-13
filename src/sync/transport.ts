/**
 * A room of peers that can exchange binary messages. The sync session is
 * written against this, so it works over Trystero in the app and over an
 * in-memory network in tests.
 */
export type Channel = "sync" | "blob";

export interface Transport {
  readonly selfId: string;
  /** Peers currently connected. */
  peers(): string[];
  /** Send to one peer, or to everyone when `target` is omitted. */
  send(channel: Channel, data: Uint8Array, target?: string): void;
  onMessage: ((channel: Channel, data: Uint8Array, from: string) => void) | null;
  onPeerJoin: ((peerId: string) => void) | null;
  onPeerLeave: ((peerId: string) => void) | null;
  close(): void;
}

/** Join the room `roomId`, which only holders of `roomKey` can enter. */
export type JoinRoom = (roomId: string, roomKey: string) => Promise<Transport>;

/** The app's network: rooms on public signalling relays (see trystero.ts). */
export const joinPublicRoom: JoinRoom = async (roomId, roomKey) =>
  (await import("./trystero")).trysteroTransport(roomId, roomKey);
