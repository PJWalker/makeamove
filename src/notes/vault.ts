import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import { newSecret } from '../lib/ids'
import { SyncSession } from '../sync/session'

/*
 * The GM vault: a document of its own for GM-only pages, kept apart from the
 * campaign so it never reaches players' devices. It is stored only on GM
 * devices and syncs over a room of its own, keyed by a secret that lives in
 * the vault itself (never in the campaign), so only devices that already
 * hold the vault can find each other.
 *
 *   meta   Y.Map  key
 *   notes  Y.Map  noteId -> Y.Map { title, folder, order, links, updatedAt, updatedBy, doc }
 *
 * A vault page's text is a subdocument of the vault, like a shared page's is
 * of the campaign root.
 */

export const vaultDbName = (campaignId: string) => `mam:vault:${campaignId}`
export const vaultGuid = (campaignId: string) => `${campaignId}/vault`
/** Its own guid, so a page revealed later doesn't collide with its vault copy. */
export const vaultNoteGuid = (campaignId: string, noteId: string) => `${campaignId}/gm-note/${noteId}`

export class Vault {
  readonly doc: Y.Doc
  readonly meta: Y.Map<any>
  readonly notes: Y.Map<Y.Map<any>>
  private persistence: IndexeddbPersistence
  private session: SyncSession | null = null
  private destroyed = false

  private constructor(readonly campaignId: string) {
    this.doc = new Y.Doc({ guid: vaultGuid(campaignId) })
    this.meta = this.doc.getMap('meta')
    this.notes = this.doc.getMap('notes')
    this.persistence = new IndexeddbPersistence(vaultDbName(campaignId), this.doc)
  }

  static async open(campaignId: string): Promise<Vault> {
    const v = new Vault(campaignId)
    await v.persistence.whenSynced
    if (!v.meta.has('key')) v.meta.set('key', newSecret())
    return v
  }

  /** The secret to the vault's room. */
  get key(): string {
    return this.meta.get('key')
  }

  /** Sync with the campaign's other GM devices, if any are around. */
  async connect() {
    if (this.session || this.destroyed) return
    let transport
    try {
      transport = (await import('../sync/trystero')).trysteroTransport(vaultGuid(this.campaignId), this.key)
    } catch {
      // Offline or blocked: the vault still works on this device.
      return
    }
    if (this.destroyed || this.session) {
      transport.close()
      return
    }
    this.session = new SyncSession(this.doc, transport)
  }

  disconnect() {
    this.session?.destroy()
    this.session = null
  }

  destroy() {
    this.destroyed = true
    this.disconnect()
    this.persistence.destroy()
    this.doc.destroy()
  }
}
