import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as syncProtocol from 'y-protocols/sync'
import * as Y from 'yjs'
import type { Transport } from './transport'

/*
 * Keeps a campaign's documents in step with its peers.
 *
 * Every message is [doc guid, kind, ...payload]. The root document and each
 * loaded scene subdocument sync independently, so a peer only receives the
 * scenes it has opened. Presence (cursors, pings) rides the root document's
 * awareness and is never stored; a subdocument can have an awareness of its
 * own (carets in a note), sent only to peers who have it open.
 *
 * Syncing is symmetric: when two peers meet each sends its state vector for
 * every document it has loaded, and the other replies with what is missing.
 * After that, each local change is broadcast as a Yjs update. Updates that
 * arrived from a peer are tagged so they are not echoed back.
 */

const SYNC = 0
const AWARENESS = 1

/** Origin of changes that came from a peer. */
const REMOTE = Symbol('remote')

interface AwarenessChange {
  added: number[]
  updated: number[]
  removed: number[]
}

export class SyncSession {
  readonly awareness: awarenessProtocol.Awareness
  private docs = new Map<string, Y.Doc>()
  private cleanups = new Map<string, () => void>()
  /** Awareness client ids each peer has told us about, by awareness, to clear them on leave. */
  private clients = new Map<awarenessProtocol.Awareness, Map<string, Set<number>>>()
  /** Subdocuments' own awareness (carets in notes), by guid. */
  private docAwareness = new Map<string, { awareness: awarenessProtocol.Awareness; stop: () => void; heard: Set<string> }>()
  private stopRoot: () => void
  /** Called when peers connect or disconnect, or their presence changes. */
  onChange: (() => void) | null = null
  /** Blob-channel traffic and new peers, for the blob exchange. */
  onBlob: ((data: Uint8Array, from: string) => void) | null = null
  onPeer: ((peer: string) => void) | null = null

  constructor(
    readonly root: Y.Doc,
    private transport: Transport,
  ) {
    this.awareness = new awarenessProtocol.Awareness(root)
    this.attach(root)

    const onSubdocs = ({ loaded, removed }: { loaded: Set<Y.Doc>; removed: Set<Y.Doc> }) => {
      for (const d of removed) this.detach(d)
      for (const d of loaded) this.attach(d)
    }
    root.on('subdocs', onSubdocs)
    // Subdocuments that were already loaded before the session started.
    for (const d of root.getSubdocs()) if (d.isLoaded) this.attach(d)

    const onAwareness = ({ added, updated, removed }: AwarenessChange, origin: unknown) => {
      if (origin === REMOTE) return
      this.sendAwareness(this.awareness, root.guid, [...added, ...updated, ...removed])
    }
    this.awareness.on('update', onAwareness)
    const changed = () => this.onChange?.()
    this.awareness.on('change', changed)

    transport.onMessage = (channel, data, from) => {
      if (channel === 'sync') this.receive(data, from)
      else this.onBlob?.(data, from)
    }
    transport.onPeerJoin = (peer) => {
      this.greet(peer)
      this.onPeer?.(peer)
      this.onChange?.()
    }
    transport.onPeerLeave = (peer) => {
      for (const [awareness, byPeer] of this.clients) {
        const ids = byPeer.get(peer)
        byPeer.delete(peer)
        if (ids?.size) awarenessProtocol.removeAwarenessStates(awareness, [...ids], REMOTE)
      }
      for (const a of this.docAwareness.values()) a.heard.delete(peer)
      this.onChange?.()
    }
    this.stopRoot = () => {
      root.off('subdocs', onSubdocs)
      this.awareness.off('update', onAwareness)
      this.awareness.off('change', changed)
    }
    for (const peer of transport.peers()) this.greet(peer)
  }

  /** Begin syncing a document (the root, or a subdocument that just loaded). */
  private attach(doc: Y.Doc) {
    if (this.docs.has(doc.guid)) return
    this.docs.set(doc.guid, doc)
    const onUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === REMOTE) return
      const enc = this.header(doc.guid, SYNC)
      syncProtocol.writeUpdate(enc, update)
      this.transport.send('sync', encoding.toUint8Array(enc))
    }
    doc.on('update', onUpdate)
    this.cleanups.set(doc.guid, () => doc.off('update', onUpdate))
    for (const peer of this.transport.peers()) this.sendStep1(doc, peer)
  }

  private detach(doc: Y.Doc) {
    this.cleanups.get(doc.guid)?.()
    this.cleanups.delete(doc.guid)
    this.docs.delete(doc.guid)
    this.dropAwareness(doc.guid)
  }

  /**
   * A subdocument's own awareness, made the first time it's asked for and
   * dropped when the document unloads. Peers who have the document open hear
   * this device's state; the root's awareness is `awareness`.
   */
  awarenessFor(doc: Y.Doc): awarenessProtocol.Awareness {
    if (doc === this.root) return this.awareness
    const known = this.docAwareness.get(doc.guid)
    if (known) return known.awareness
    const awareness = new awarenessProtocol.Awareness(doc)
    const onUpdate = ({ added, updated, removed }: AwarenessChange, origin: unknown) => {
      if (origin === REMOTE) return
      this.sendAwareness(awareness, doc.guid, [...added, ...updated, ...removed])
    }
    awareness.on('update', onUpdate)
    this.docAwareness.set(doc.guid, { awareness, heard: new Set(), stop: () => awareness.off('update', onUpdate) })
    return awareness
  }

  private dropAwareness(guid: string) {
    const a = this.docAwareness.get(guid)
    if (!a) return
    a.stop()
    // Tell peers this device has left the document.
    awarenessProtocol.removeAwarenessStates(a.awareness, [a.awareness.clientID], 'local')
    this.sendAwareness(a.awareness, guid, [a.awareness.clientID])
    a.awareness.destroy()
    this.clients.delete(a.awareness)
    this.docAwareness.delete(guid)
  }

  private header(guid: string, kind: number) {
    const enc = encoding.createEncoder()
    encoding.writeVarString(enc, guid)
    encoding.writeVarUint(enc, kind)
    return enc
  }

  private sendStep1(doc: Y.Doc, peer: string) {
    const enc = this.header(doc.guid, SYNC)
    syncProtocol.writeSyncStep1(enc, doc)
    this.transport.send('sync', encoding.toUint8Array(enc), peer)
  }

  private sendAwareness(awareness: awarenessProtocol.Awareness, guid: string, clients: number[], peer?: string) {
    const enc = this.header(guid, AWARENESS)
    encoding.writeVarUint8Array(enc, awarenessProtocol.encodeAwarenessUpdate(awareness, clients))
    this.transport.send('sync', encoding.toUint8Array(enc), peer)
  }

  sendBlob(data: Uint8Array, peer?: string) {
    this.transport.send('blob', data, peer)
  }

  private greet(peer: string) {
    for (const doc of this.docs.values()) this.sendStep1(doc, peer)
    this.sendAwareness(this.awareness, this.root.guid, [this.root.clientID], peer)
    for (const [guid, a] of this.docAwareness) this.sendAwareness(a.awareness, guid, [a.awareness.clientID], peer)
  }

  private receive(data: Uint8Array, from: string) {
    const dec = decoding.createDecoder(data)
    const guid = decoding.readVarString(dec)
    const kind = decoding.readVarUint(dec)

    if (kind === AWARENESS) {
      const sub = this.docAwareness.get(guid)
      // A subdocument this device doesn't have open: nothing to show. Anything else is the root's.
      if (!sub && this.root.getSubdocGuids().has(guid)) return
      const awareness = sub?.awareness ?? this.awareness
      const byPeer = this.clients.get(awareness) ?? new Map<string, Set<number>>()
      this.clients.set(awareness, byPeer)
      const ids = byPeer.get(from) ?? new Set<number>()
      byPeer.set(from, ids)
      const track = ({ added, updated }: AwarenessChange) => [...added, ...updated].forEach((id) => ids.add(id))
      awareness.on('update', track)
      awarenessProtocol.applyAwarenessUpdate(awareness, decoding.readVarUint8Array(dec), REMOTE)
      awareness.off('update', track)
      // Someone new in a document we have open: tell them where we are.
      if (sub && !sub.heard.has(from)) {
        sub.heard.add(from)
        this.sendAwareness(awareness, guid, [awareness.clientID], from)
      }
      return
    }

    const doc = this.docs.get(guid)
    // A scene this peer hasn't opened: it asks when it does.
    if (!doc) return
    const isStep1 = decoding.peekVarUint(dec) === syncProtocol.messageYjsSyncStep1
    const reply = this.header(guid, SYNC)
    syncProtocol.readSyncMessage(dec, reply, doc, REMOTE)
    if (isStep1) this.transport.send('sync', encoding.toUint8Array(reply), from)
  }

  peerIds(): string[] {
    return this.transport.peers()
  }

  destroy() {
    for (const guid of [...this.docAwareness.keys()]) this.dropAwareness(guid)
    this.stopRoot()
    for (const c of this.cleanups.values()) c()
    this.cleanups.clear()
    this.docs.clear()
    awarenessProtocol.removeAwarenessStates(this.awareness, [this.root.clientID], 'destroy')
    this.awareness.destroy()
    this.transport.onMessage = null
    this.transport.onPeerJoin = null
    this.transport.onPeerLeave = null
    this.transport.close()
  }
}
