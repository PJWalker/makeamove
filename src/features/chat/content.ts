import type { JSONContent } from "@tiptap/core";
import type { LinkKind } from "../notes/links";
import { LINK_NODE } from "../notes/links";
import { plainParagraph, plainText, TRACKER_NODE, trackerToken } from "../../data/richText";
import type { RichText, TrackerButton } from "../../data/richText";
import { isString } from "../../lib/guards";

/** A chat message's text: rich text, as everywhere else. */
export type ChatContent = RichText;

type NameOf = (kind: LinkKind, id: string) => string | null;

const entityToken = (kind: LinkKind, id: string, text = "") =>
  `@[${text.replaceAll(/[\n\]]/g, "")}](${kind}:${id})`;

export function emptyChatContent(): ChatContent {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

/** Typed text as a message: one paragraph, its line breaks kept. */
export function contentFromText(text: string): ChatContent {
  return { type: "doc", content: [plainParagraph(text)] };
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

function attributesOf(node: JSONContent) {
  return node.attrs ?? {};
}

function entityTokenOf(node: JSONContent): string {
  const attributes = attributesOf(node);
  return entityToken(
    attributes["kind"] as LinkKind,
    String(attributes["id"] ?? ""),
    isString(attributes["text"]) ? attributes["text"] : "",
  );
}

/** The text a link or tracker button stands for when typed. */
function atomToken(node: JSONContent): string | null {
  if (node.type === LINK_NODE) return entityTokenOf(node);
  if (node.type === TRACKER_NODE) return trackerToken(attributesOf(node) as TrackerButton);
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

/** A message as plain text, its links by name: for notifications. */
export function messageText(content: ChatContent, nameOf: NameOf = () => null): string {
  return plainText(content, (node) => {
    if (node.type !== LINK_NODE) return null;
    const attributes = attributesOf(node);
    return (
      (isString(attributes["text"]) && attributes["text"]) ||
      nameOf(attributes["kind"] as LinkKind, String(attributes["id"] ?? "")) ||
      (isString(attributes["label"]) && attributes["label"]) ||
      "a link"
    );
  });
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
        if (content.length > 0) selected.push({ ...node, content });
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
  if (start === -1) return contentFromText(body);

  let offset = 0;
  const blocks: JSONContent[] = [];
  const sourceBlocks = content.content ?? [];
  for (const [index, block] of sourceBlocks.entries()) {
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
  }
  return {
    type: "doc",
    content: blocks.length > 0 ? blocks : [{ type: "paragraph" }],
  };
}
