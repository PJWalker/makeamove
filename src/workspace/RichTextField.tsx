import { Editor } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, useLayoutEffect, useRef } from "react";
import type { Campaign } from "../campaign/campaign";
import type { RichText } from "../data/richText";
import { ruleTextExtensions } from "./RichTextView";
import { useCampaign } from "./campaignContext";

/**
 * A form field for rules text (a homebrew move's text, its outcomes): rich
 * text with formatting and [[+1 XP]] buttons, kept by the form as
 * Tiptap JSON until it saves. `value` seeds the editor when it mounts.
 */
export function RichTextField({
  campaign,
  label,
  value,
  onChange,
  placeholder = "",
}: {
  campaign: Campaign;
  label: string;
  value: RichText | undefined;
  onChange: (value: RichText) => void;
  placeholder?: string;
}) {
  const ctx = useCampaign();
  const hostRef = useRef<HTMLDivElement>(null);
  const initial = useRef(value);
  // The editor reads the latest callback.
  const change = useRef(onChange);
  useLayoutEffect(() => {
    change.current = onChange;
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const editor = new Editor({
      element: host,
      extensions: [...ruleTextExtensions(ctx), Placeholder.configure({ placeholder })],
      ...(initial.current ? { content: initial.current } : {}),
      editorProps: { attributes: { class: "note-body", "aria-label": label } },
      onUpdate: ({ editor: ed }) => change.current(ed.getJSON()),
    });
    return () => editor.destroy();
  }, [campaign, ctx, label, placeholder]);

  return (
    <div className="field">
      {label}
      <div ref={hostRef} className="rich-field input" />
    </div>
  );
}
