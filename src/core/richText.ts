import type { JSONContent } from "@tiptap/core";

/*
 * Formatted text, in the one shape the app uses everywhere: a Tiptap "doc"
 * node as JSON. Notes, chat messages and rules text (moves, outcomes,
 * reference sections) are all stored and rendered as this. Rules text is
 * written as markdown in the source and turned into this at build time
 * (see src/macros/markdown.macro.ts); nothing parses markdown in the browser.
 */
export type RichText = JSONContent;

/** The rich-text node an inline tracker button is stored as. */
export const TRACKER_NODE = "trackerButton";

/** [[±N name]] or [[±N name|label]]: how a tracker button is typed. */
export const TRACKER_TOKEN = /\[\[\s*([+-]\d+)\s+([^\]|]+?)\s*(?:\|\s*([^\]]+?)\s*)?\]\]/g;

export interface TrackerButton {
  by: number;
  /** The number's name as written. */
  name: string;
  label: string;
}

export function parseTrackerButton(raw: string): TrackerButton | null {
  const m = new RegExp(TRACKER_TOKEN.source).exec(raw);
  if (!m) return null;
  const by = Number(m[1]);
  const name = m[2]!;
  return { by, name, label: m[3] ?? `${by > 0 ? "+" : ""}${by} ${name}` };
}

/** The token for a button: what the editor writes back as text. */
export const trackerToken = (b: TrackerButton) =>
  `[[${b.by > 0 ? "+" : ""}${b.by} ${b.name}${b.label !== `${b.by > 0 ? "+" : ""}${b.by} ${b.name}` ? `|${b.label}` : ""}]]`;

/** Rich text with nothing in it. */
export const emptyRichText = (): RichText => ({ type: "doc", content: [] });

/** A paragraph of plain text, its line breaks kept. */
function plainParagraph(text: string): JSONContent {
  const content: JSONContent[] = [];
  for (const [index, line] of text.split("\n").entries()) {
    if (index) content.push({ type: "hardBreak" });
    if (line) content.push({ type: "text", text: line });
  }
  return { type: "paragraph", ...(content.length ? { content } : {}) };
}

/**
 * Plain text, with nothing in it read as formatting: blank lines part
 * paragraphs, other line breaks are kept. For text made up at runtime (from a
 * template, or typed into a plain field); rules text written as markdown is
 * converted at build time instead.
 */
export function richTextFromPlain(text: string): RichText {
  const blocks = text.split(/\n\s*\n/);
  return { type: "doc", content: blocks.map(plainParagraph) };
}

/**
 * Stored rich text, read safely: text saved before rules text became rich
 * text (a chat move card, a homebrew move) is a plain string.
 */
export function asRichText(value: RichText | string | undefined): RichText {
  if (value === undefined) return emptyRichText();
  return typeof value === "string" ? richTextFromPlain(value) : value;
}

/** Whether two rich texts say the same thing in the same way. */
export const sameRichText = (a: RichText, b: RichText) => JSON.stringify(a) === JSON.stringify(b);

const BLOCKS = new Set(["paragraph", "heading", "codeBlock"]);

/**
 * Rich text as plain text, for tooltips, search and notifications: blocks on
 * their own lines, list items bulleted, buttons and links as their labels.
 * `atomText` names an inline atom (a link) it doesn't know itself.
 */
export function plainText(
  doc: RichText | undefined,
  atomText: (node: JSONContent) => string | null = () => null,
): string {
  const lines: string[] = [];
  const inline = (node: JSONContent): string => {
    if (node.type === "text") return node.text ?? "";
    if (node.type === "hardBreak") return "\n";
    if (node.type === TRACKER_NODE) return String(node.attrs?.label ?? "");
    if (!node.content) {
      const named = atomText(node);
      if (named !== null) return named;
      const attrs = node.attrs ?? {};
      return String(attrs.text || attrs.label || "");
    }
    return node.content.map(inline).join("");
  };
  const block = (node: JSONContent, bullet = "") => {
    if (node.type === "listItem") {
      node.content?.forEach((child, i) => block(child, i ? "" : "• "));
      return;
    }
    if (BLOCKS.has(node.type ?? "")) {
      lines.push(bullet + (node.content ?? []).map(inline).join(""));
      return;
    }
    node.content?.forEach((child) => block(child));
  };
  block(doc ?? {});
  return lines.join("\n");
}
