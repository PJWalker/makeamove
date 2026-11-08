import type { JSONContent } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { parseTrackerButton, TRACKER_NODE, TRACKER_TOKEN, type RichText } from "../core/richText";

/*
 * Build-time only. Import it with `with { type: "macro" }` and each call runs
 * while bundling, with its result inlined as JSON, so markdown parsing never
 * reaches the browser. vite.config.ts refuses any other import of a
 * *.macro.ts file.
 */

const manager = new MarkdownManager({ extensions: [StarterKit] });

/** A text node's line breaks and [[tracker]] tokens, as their own nodes. */
function splitText(node: JSONContent): JSONContent[] {
  const marks = node.marks ? { marks: node.marks } : {};
  const out: JSONContent[] = [];
  const text = (value: string) => {
    value.split("\n").forEach((line, i) => {
      if (i) out.push({ type: "hardBreak" });
      if (line) out.push({ type: "text", text: line, ...marks });
    });
  };
  let last = 0;
  for (const m of (node.text ?? "").matchAll(TRACKER_TOKEN)) {
    text(node.text!.slice(last, m.index));
    const b = parseTrackerButton(m[0]);
    out.push(b ? { type: TRACKER_NODE, attrs: { ...b } } : { type: "text", text: m[0], ...marks });
    last = m.index + m[0].length;
  }
  text((node.text ?? "").slice(last));
  return out;
}

function normalise(node: JSONContent): JSONContent {
  if (!node.content) return node;
  return {
    ...node,
    content: node.content.flatMap((child) =>
      child.type === "text" ? splitText(child) : [normalise(child)],
    ),
  };
}

/** Markdown as rich text: **bold**, *italic*, lists, headings and [[±N tracker]] buttons. */
export function markdownToRichText(markdown: string): RichText {
  return normalise(manager.parse(markdown));
}

/** `md("…")` in source becomes that markdown's rich text in the bundle. */
export function md(markdown: string): RichText {
  return markdownToRichText(markdown);
}
