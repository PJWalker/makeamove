import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { dataName } from "../../platform/dataEpoch";

/*
 * A note's text: a Yjs subdocument of the campaign root, holding one
 * XmlFragment (`body`) that the rich-text editor binds to. Like a scene, it
 * is persisted in its own IndexedDB database and loaded only while open; the
 * sync session picks it up as soon as it loads.
 */

export const noteGuid = (campaignId: string, noteId: string) => `${campaignId}/note/${noteId}`;
export const noteDbName = (guid: string) => dataName("note", guid);

/** How long after the last change, from anyone, an open page reports its text. */
const REPORT_MS = 800;

export class NoteDoc {
  readonly doc: Y.Doc;
  readonly body: Y.XmlFragment;
  private persistence: IndexeddbPersistence;
  private report: (() => void) | null = null;
  private reportTimer: ReturnType<typeof setTimeout> | undefined;

  private constructor(doc: Y.Doc) {
    this.doc = doc;
    this.body = doc.getXmlFragment("body");
    this.persistence = new IndexeddbPersistence(noteDbName(doc.guid), doc);
  }

  /**
   * Load the note. `onText` hears its text as stored, then again shortly
   * after each change and on closing, whoever made the change.
   */
  static async open(doc: Y.Doc, onText?: (body: Y.XmlFragment) => void): Promise<NoteDoc> {
    doc.load();
    const n = new NoteDoc(doc);
    await n.persistence.whenSynced;
    if (onText) {
      n.report = () => {
        n.reportTimer = undefined;
        onText(n.body);
      };
      n.report();
      n.body.observeDeep(() => {
        clearTimeout(n.reportTimer);
        n.reportTimer = setTimeout(n.report!, REPORT_MS);
      });
    }
    return n;
  }

  /** Unload the note. Its subdocument is replaced by an unloaded stub. */
  destroy() {
    if (this.reportTimer) {
      clearTimeout(this.reportTimer);
      this.report?.();
    }
    void this.persistence.destroy();
    this.doc.destroy();
  }
}
