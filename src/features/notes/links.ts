/** What a link in a note points at. */
import { isString } from "../../lib/guards";
export type LinkKind = "note" | "character" | "scene" | "item" | "move";
/** A link target, as stored: `kind:id`. */
export type LinkRef = `${LinkKind}:${string}`;

/** The editor's node for a link chip: an inline atom pointing at something. */
export const LINK_NODE = "entityLink";

export const LINK_KINDS: LinkKind[] = ["note", "character", "scene", "item", "move"];

/** A document node as the editor serialises it (ProseMirror JSON). */
interface DocumentNode {
  type?: string;
  attrs?: Record<string, unknown> | undefined;
  content?: DocumentNode[] | undefined;
}

/** Every distinct link in a page, in the order they appear. */
export function linksIn(document: DocumentNode): LinkRef[] {
  const seen = new Set<LinkRef>();
  const walk = (n: DocumentNode) => {
    if (
      n.type === LINK_NODE &&
      LINK_KINDS.includes(n.attrs?.["kind"] as LinkKind) &&
      isString(n.attrs?.["id"])
    ) {
      seen.add(`${n.attrs["kind"] as LinkKind}:${n.attrs["id"]}`);
    }
    n.content?.forEach(walk);
  };
  walk(document);
  return [...seen];
}

/** Split a stored link back into its kind and id. */
export function parseLink(reference: LinkRef): { kind: LinkKind; id: string } {
  const index = reference.indexOf(":");
  return { kind: reference.slice(0, index) as LinkKind, id: reference.slice(index + 1) };
}
