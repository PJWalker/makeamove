import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'

/*
 * Peer-to-peer image transfer. A device that lacks an image asks its peers for
 * it by hash; whoever has it sends it back in chunks. The receiver checks the
 * SHA-256 before keeping anything, so a peer can't substitute a different file.
 */

const REQUEST = 0
const DATA = 1
const MISSING = 2

export interface BlobStore {
  get(hash: string): Promise<Blob | null>
  /** Store a blob and return its hash. */
  put(blob: Blob): Promise<string>
}

export interface BlobLink {
  sendBlob(data: Uint8Array, peer?: string): void
  peerIds(): string[]
  onBlob: ((data: Uint8Array, from: string) => void) | null
  onPeer: ((peer: string) => void) | null
}

interface Pending {
  waiters: ((blob: Blob | null) => void)[]
  /** Peers already asked, so a late join doesn't cause a second request. */
  asked: Set<string>
  retry: ReturnType<typeof setInterval>
}

export class BlobExchange {
  private pending = new Map<string, Pending>()

  constructor(
    private link: BlobLink,
    private store: BlobStore,
  ) {
    link.onBlob = (data, from) => this.receive(data, from)
    link.onPeer = (peer) => {
      for (const hash of this.pending.keys()) this.request(hash, peer)
    }
  }

  /** Get a blob from any peer. Waits for one to have it; null if closed first. */
  fetch(hash: string): Promise<Blob | null> {
    return new Promise((resolve) => {
      const existing = this.pending.get(hash)
      if (existing) {
        existing.waiters.push(resolve)
        return
      }
      // Ask again now and then, in case a request or reply was lost.
      const retry = setInterval(() => {
        const p = this.pending.get(hash)
        if (!p) return
        p.asked.clear()
        for (const peer of this.link.peerIds()) this.request(hash, peer)
      }, 8000)
      this.pending.set(hash, { waiters: [resolve], asked: new Set(), retry })
      for (const peer of this.link.peerIds()) this.request(hash, peer)
    })
  }

  close() {
    this.link.onBlob = null
    this.link.onPeer = null
    for (const p of this.pending.values()) {
      clearInterval(p.retry)
      for (const w of p.waiters) w(null)
    }
    this.pending.clear()
  }

  private request(hash: string, peer: string) {
    const p = this.pending.get(hash)
    if (p?.asked.has(peer)) return
    p?.asked.add(peer)
    const enc = encoding.createEncoder()
    encoding.writeVarUint(enc, REQUEST)
    encoding.writeVarString(enc, hash)
    this.link.sendBlob(encoding.toUint8Array(enc), peer)
  }

  private receive(data: Uint8Array, from: string) {
    const dec = decoding.createDecoder(data)
    const type = decoding.readVarUint(dec)
    const hash = decoding.readVarString(dec)
    if (!/^[0-9a-f]{64}$/.test(hash)) return
    if (type === REQUEST) void this.serve(hash, from)
    else if (type === DATA) void this.accept(hash, dec)
  }

  private async serve(hash: string, peer: string) {
    const blob = await this.store.get(hash)
    const enc = encoding.createEncoder()
    if (!blob) {
      encoding.writeVarUint(enc, MISSING)
      encoding.writeVarString(enc, hash)
    } else {
      // The transport splits large messages itself.
      encoding.writeVarUint(enc, DATA)
      encoding.writeVarString(enc, hash)
      encoding.writeVarUint8Array(enc, new Uint8Array(await blob.arrayBuffer()))
    }
    this.link.sendBlob(encoding.toUint8Array(enc), peer)
  }

  private async accept(hash: string, dec: decoding.Decoder) {
    const pending = this.pending.get(hash)
    if (!pending) return
    const blob = new Blob([decoding.readVarUint8Array(dec).slice()])
    // A bad copy is dropped and we keep waiting for another peer.
    if ((await sha256Hex(blob)) !== hash) return
    if (!this.pending.delete(hash)) return
    clearInterval(pending.retry)
    await this.store.put(blob)
    for (const w of pending.waiters) w(blob)
  }
}

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
