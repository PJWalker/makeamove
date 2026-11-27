import type { Editor } from "@tiptap/core";
import { useEffect, useRef, useState } from "react";
import { Awareness } from "y-protocols/awareness";
import { getNote, noteSubdoc, openNotePage, touchNote } from "../features/notes/api";
import type { NoteDoc as NoteDocument } from "../features/notes/noteDoc";
import { linksIn } from "../features/notes/links";
import type { Campaign } from "../campaign/campaign";
import { mountRichText } from "../workspace/richText";
import { myName } from "../features/chat/send";
import { useQuery } from "../ui/useQuery";
import { useCampaign } from "../workspace/campaignContext";

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
  const context = useCampaign();
  const hostReference = useRef<HTMLDivElement>(null);
  const editorReference = useRef<Editor | null>(null);
  const [loading, setLoading] = useState(true);
  const searchTarget = useQuery(context.links.noteSearchTarget);

  useEffect(() => {
    const host = hostReference.current;
    const sub = noteSubdoc(campaign, noteId);
    if (!host || !sub) return;
    let cancelled = false;
    let note: NoteDocument | null = null;
    let editor: Editor | null = null;
    let rich: ReturnType<typeof mountRichText> | null = null;
    let timer: ReturnType<typeof globalThis.setTimeout> | undefined;

    let local: Awareness | null = null;
    void openNotePage(campaign, noteId).then((n) => {
      if (!n) return;
      if (cancelled) { n.destroy(); return; }
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
        ctx: context,
        fragment: n.body,
        placeholder: "Write here. Type @ to link a note, character, scene, gear or move.",
        label: "Note text",
        noteId,
        shared: !getNote(campaign, noteId)?.gmOnly,
        onLocalEdit: (ed) => {
          if (timer !== undefined) clearTimeout(timer);
          timer = globalThis.setTimeout(
            () => { touchNote(campaign, noteId, linksIn(ed.getJSON())); },
            TOUCH_MS,
          );
        },
      });
      editor = rich.editor;
      editorReference.current = editor;
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
      editorReference.current = null;
      local?.destroy();
      note?.destroy();
    };
  }, [context, campaign, noteId]);

  useEffect(() => {
    const target = searchTarget;
    const editor = editorReference.current;
    if (!active || loading || !editor || target?.noteId !== noteId) return;
    const from = Math.max(1, Math.min(target.from, editor.state.doc.content.size));
    const to = Math.max(from, Math.min(target.to, editor.state.doc.content.size));
    editor.chain().setTextSelection({ from, to }).scrollIntoView().focus().run();
    context.links.noteSearchTarget.set(null);
  }, [context, active, loading, noteId, searchTarget]);

  return (
    <div className="note-editor" data-loading={loading || undefined}>
      <div ref={hostReference} />
    </div>
  );
}
