import { joinRoom, selfId } from 'trystero'
import type { Channel, Transport } from './transport'

const APP_ID = 'makeamove'

/**
 * A room on public signalling relays (Nostr by default). The room key is the
 * Trystero password, so session descriptions are encrypted and only holders
 * of the invite can connect; the data channels are encrypted by WebRTC.
 */
export function trysteroTransport(campaignId: string, roomKey: string): Transport {
  const room = joinRoom({ appId: APP_ID, password: roomKey }, campaignId)
  const peers = new Set<string>()
  const actions = {
    sync: room.makeAction<Uint8Array>('sync'),
    blob: room.makeAction<Uint8Array>('blob'),
  }

  const t: Transport = {
    selfId,
    peers: () => [...peers],
    send(channel: Channel, data, target) {
      // Peers may leave mid-send; nothing to do about it here.
      actions[channel].send(data, target ? { target } : undefined).catch(() => {})
    },
    onMessage: null,
    onPeerJoin: null,
    onPeerLeave: null,
    close: () => void room.leave(),
  }
  for (const channel of ['sync', 'blob'] as const) {
    actions[channel].onMessage = (data, { peerId }) => t.onMessage?.(channel, new Uint8Array(data), peerId)
  }
  room.onPeerJoin = (id) => {
    peers.add(id)
    t.onPeerJoin?.(id)
  }
  room.onPeerLeave = (id) => {
    peers.delete(id)
    t.onPeerLeave?.(id)
  }
  return t
}
