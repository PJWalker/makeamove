import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'

/*
 * A note's text: a Yjs subdocument of the campaign root, holding one
 * XmlFragment (`body`) that the rich-text editor binds to. Like a scene, it
 * is persisted in its own IndexedDB database and loaded only while open; the
 * sync session picks it up as soon as it loads.
 */

export const noteGuid = (campaignId: string, noteId: string) => `${campaignId}/note/${noteId}`
export const noteDbName = (guid: string) => `mam:note:${guid}`

export class NoteDoc {
  readonly doc: Y.Doc
  readonly body: Y.XmlFragment
  private persistence: IndexeddbPersistence

  private constructor(doc: Y.Doc) {
    this.doc = doc
    this.body = doc.getXmlFragment('body')
    this.persistence = new IndexeddbPersistence(noteDbName(doc.guid), doc)
  }

  static async open(doc: Y.Doc): Promise<NoteDoc> {
    doc.load()
    const n = new NoteDoc(doc)
    await n.persistence.whenSynced
    return n
  }

  /** Unload the note. Its subdocument is replaced by an unloaded stub. */
  destroy() {
    this.persistence.destroy()
    this.doc.destroy()
  }
}
