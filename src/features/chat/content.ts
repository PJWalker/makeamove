import type { JSONContent } from "@tiptap/core";
import type { LinkKind } from "../notes/links";
import { LINK_NODE } from "../notes/links";
import { TRACKER_NODE, trackerToken, type TrackerButton } from "../characters/trackers";

export type ChatContent = JSONContent;

type NameOf = (kind: LinkKind, id: string) => string | null;

const entityToken = (kind: LinkKind, id: string, text = "") =>
  `@[${text.replace(/[\]\n]/g, "")}](${kind}:${id})`;

export function emptyChatContent(): ChatContent {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

export function contentFromText(text: string): ChatContent {
  const content: JSONContent[] = [];
  for (const [index, line] of text.split("\n").entries()) {
    if (index) content.push({ type: "hardBreak" });
    if (line) content.push({ type: "text", text: line });
  }
  return { type: "doc", content: [{ type: "paragraph", content }] };
}

export function entityContent(kind: LinkKind, id: string, label: string): ChatContent {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: LINK_NODE, attrs: { kind, id, label, text: null } },
          { type: "text", text: " " },
        ],
      },
    ],
  };
}

function attrsOf(node: JSONContent) {
  return node.attrs ?? {};
}

function entityTokenOf(node: JSONContent): string {
  const attrs = attrsOf(node);
  return entityToken(
    attrs.kind as LinkKind,
    String(attrs.id ?? ""),
    typeof attrs.text === "string" ? attrs.text : "",
  );
}

/** The text a link or tracker button stands for when typed. */
function atomToken(node: JSONContent): string | null {
  if (node.type === LINK_NODE) return entityTokenOf(node);
  if (node.type === TRACKER_NODE) return trackerToken(attrsOf(node) as TrackerButton);
  return null;
}

function inlineText(node: JSONContent, atomText: (node: JSONContent) => string): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === LINK_NODE || node.type === TRACKER_NODE) return atomText(node);
  if (node.type === "hardBreak") return "\n";
  return (node.content ?? []).map((child) => inlineText(child, atomText)).join("");
}

export function commandText(content: ChatContent): string {
  return (content.content ?? [])
    .map((block) => inlineText(block, (node) => atomToken(node) ?? ""))
    .join("\n");
}

export function plainText(content: ChatContent, nameOf: NameOf = () => null): string {
  const atomText = (node: JSONContent) => {
    const attrs = attrsOf(node);
    if (node.type === TRACKER_NODE) return String(attrs.label ?? "");
    return (
      (typeof attrs.text === "string" && attrs.text) ||
      nameOf(attrs.kind as LinkKind, String(attrs.id ?? "")) ||
      (typeof attrs.label === "string" && attrs.label) ||
      "a link"
    );
  };
  return (content.content ?? []).map((block) => inlineText(block, atomText)).join("\n");
}

function nodeLength(node: JSONContent): number {
  if (node.type === "text") return node.text?.length ?? 0;
  const token = atomToken(node);
  if (token !== null) return token.length;
  if (node.type === "hardBreak") return 1;
  return (node.content ?? []).reduce((length, child) => length + nodeLength(child), 0);
}

function sliceInline(nodes: JSONContent[], start: number, end: number): JSONContent[] {
  const selected: JSONContent[] = [];
  let offset = 0;
  for (const node of nodes) {
    const length = nodeLength(node);
    const from = Math.max(start, offset);
    const to = Math.min(end, offset + length);
    if (from < to) {
      if (node.type === "text") {
        selected.push({
          ...node,
          text: node.text!.slice(from - offset, to - offset),
        });
      } else if (atomToken(node) !== null) {
        if (from === offset && to === offset + length) selected.push(node);
        else
          selected.push({
            type: "text",
            text: atomToken(node)!.slice(from - offset, to - offset),
          });
      } else if (node.type === "hardBreak") {
        selected.push(node);
      } else if (node.content) {
        const content = sliceInline(node.content, from - offset, to - offset);
        if (content.length) selected.push({ ...node, content });
      }
    }
    offset += length;
  }
  return selected;
}

export function contentForCommand(content: ChatContent, body: string): ChatContent {
  if (!body) return emptyChatContent();
  const source = commandText(content);
  const start = source.lastIndexOf(body);
  if (start < 0) return contentFromText(body);

  let offset = 0;
  const blocks: JSONContent[] = [];
  const sourceBlocks = content.content ?? [];
  sourceBlocks.forEach((block, index) => {
    const length = nodeLength(block);
    const from = Math.max(0, start - offset);
    const to = Math.min(length, start + body.length - offset);
    if (from < to) {
      blocks.push({
        ...block,
        content: sliceInline(block.content ?? [], from, to),
      });
    }
    offset += length + (index < sourceBlocks.length - 1 ? 1 : 0);
  });
  return {
    type: "doc",
    content: blocks.length ? blocks : [{ type: "paragraph" }],
  };
}
