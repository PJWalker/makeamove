import type { LinkKind, LinkRef } from './api'

/** The editor's node for a link chip: an inline atom pointing at something. */
export const LINK_NODE = 'entityLink'

export const LINK_KINDS: LinkKind[] = ['note', 'character', 'scene', 'item', 'move']

/** A document node as the editor serialises it (ProseMirror JSON). */
interface DocNode {
  type?: string
  attrs?: Record<string, unknown>
  content?: DocNode[]
}

/** Every distinct link in a page, in the order they appear. */
export function linksIn(doc: DocNode): LinkRef[] {
  const seen = new Set<LinkRef>()
  const walk = (n: DocNode) => {
    if (n.type === LINK_NODE && LINK_KINDS.includes(n.attrs?.kind as LinkKind) && typeof n.attrs?.id === 'string') {
      seen.add(`${n.attrs.kind as LinkKind}:${n.attrs.id}`)
    }
    n.content?.forEach(walk)
  }
  walk(doc)
  return [...seen]
}

/** Split a stored link back into its kind and id. */
export function parseLink(ref: LinkRef): { kind: LinkKind; id: string } {
  const i = ref.indexOf(':')
  return { kind: ref.slice(0, i) as LinkKind, id: ref.slice(i + 1) }
}
