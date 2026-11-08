import type { Editor } from "@tiptap/core";
import { useEffect, useRef, useState } from "react";
import { getNote, noteSubdoc, touchNote } from "../features/notes/api";
import { NoteDoc } from "../features/notes/noteDoc";
import { linksIn } from "../features/notes/links";
import { noteSearchTarget } from "../workspace/linkNavigation";
import type { Campaign } from "../campaign/campaign";
import { mountRichText } from "../workspace/richText";
import { Awareness } from "y-protocols/awareness";
import { myName } from "../features/chat/send";
import { useValue } from "../ui/useValue";

/** How long after the last keystroke a page records its links and edit time. */
const TOUCH_MS = 800;

/** A note's text, edited together: anyone at the table can write in it. */
export function NoteEditor({
  campaign,
  noteId,
  active,
}: {
  campaign: Campaign;
  noteId: string;
  active: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const [loading, setLoading] = useState(true);
  const searchTarget = useValue(noteSearchTarget);

  useEffect(() => {
    const host = hostRef.current;
    const sub = noteSubdoc(campaign, noteId);
    if (!host || !sub) return;
    let cancelled = false;
    let note: NoteDoc | null = null;
    let editor: Editor | null = null;
    let rich: ReturnType<typeof mountRichText> | null = null;
    let timer = 0;

    let local: Awareness | null = null;
    void NoteDoc.open(sub).then((n) => {
      if (cancelled) return n.destroy();
      note = n;
      const gmOnly = !!getNote(campaign, noteId)?.gmOnly;
      // Carets travel with the page's own sync: the campaign's, or for a GM page the vault's.
      const session = gmOnly ? campaign.vault.value?.sync : campaign.sync;
      const awareness = session?.awarenessFor(sub) ?? (local = new Awareness(sub));
      rich = mountRichText(host, {
        carets: { awareness, name: myName(campaign) },
        // A GM page is secret already; a shared page's secrets are the vault's.
        ...(gmOnly
          ? {}
          : { secrets: { vault: campaign.isGm() ? (campaign.vault.value?.doc ?? null) : null } }),
        campaign,
        fragment: n.body,
        placeholder: "Write here. Type @ to link a note, character, scene, gear or move.",
        label: "Note text",
        noteId,
        shared: !getNote(campaign, noteId)?.gmOnly,
        onLocalEdit: (ed) => {
          clearTimeout(timer);
          timer = window.setTimeout(
            () => touchNote(campaign, noteId, linksIn(ed.getJSON())),
            TOUCH_MS,
          );
        },
      });
      editor = rich.editor;
      editorRef.current = editor;
      setLoading(false);
    });

    return () => {
      cancelled = true;
      // Record any edit still waiting, then let go of the page.
      if (timer && editor) {
        clearTimeout(timer);
        touchNote(campaign, noteId, linksIn(editor.getJSON()));
      }
      rich?.destroy();
      editorRef.current = null;
      local?.destroy();
      note?.destroy();
    };
  }, [campaign, noteId]);

  useEffect(() => {
    const target = searchTarget;
    const editor = editorRef.current;
    if (!active || loading || !editor || target?.noteId !== noteId) return;
    const from = Math.max(1, Math.min(target.from, editor.state.doc.content.size));
    const to = Math.max(from, Math.min(target.to, editor.state.doc.content.size));
    editor.chain().setTextSelection({ from, to }).scrollIntoView().focus().run();
    noteSearchTarget.value = null;
  }, [active, loading, noteId, searchTarget]);

  return (
    <div className="note-editor" data-loading={loading || undefined}>
      <div ref={hostRef} />
    </div>
  );
}
