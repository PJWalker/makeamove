import type { LinkKind } from '../notes/api'

/*
 * Markdown-lite for chat: **bold**, *italic* or _italic_, `code`,
 * [label](https://…), bare links, and links to things in the campaign,
 * written @[text](kind:id) (the text is empty unless the link was given
 * words of its own). It produces segments, never HTML, so nothing a player
 * types can inject markup. Styles don't nest.
 */

export type Segment =
  | { type: 'text' | 'bold' | 'italic' | 'code'; text: string }
  | { type: 'link'; text: string; href: string }
  | { type: 'entity'; kind: LinkKind; id: string; text: string }

/** A link to something in the campaign, as chat text. */
export const entityToken = (kind: LinkKind, id: string, text = '') => `@[${text.replace(/[\]\n]/g, '')}](${kind}:${id})`

const PATTERN =
  /@\[([^\]\n]*)\]\((note|character|scene|item|move):([^)\s]+)\)|`([^`\n]+)`|\*\*([^*\n]+)\*\*|\*([^*\s][^*\n]*?)\*|(?<![\w])_([^_\s][^_\n]*?)_(?![\w])|\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)|((?:https?:\/\/)[^\s<>()]+[^\s<>().,;:!?'"])/g

export function tokenize(text: string): Segment[] {
  const out: Segment[] = []
  let last = 0
  for (const m of text.matchAll(PATTERN)) {
    if (m.index > last) out.push({ type: 'text', text: text.slice(last, m.index) })
    if (m[2] !== undefined) out.push({ type: 'entity', kind: m[2] as LinkKind, id: m[3], text: m[1] })
    else if (m[4] !== undefined) out.push({ type: 'code', text: m[4] })
    else if (m[5] !== undefined) out.push({ type: 'bold', text: m[5] })
    else if (m[6] !== undefined) out.push({ type: 'italic', text: m[6] })
    else if (m[7] !== undefined) out.push({ type: 'italic', text: m[7] })
    else if (m[8] !== undefined) out.push({ type: 'link', text: m[8], href: m[9] })
    else out.push({ type: 'link', text: m[10], href: m[10] })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) })
  return out
}

/** Chat text as plain words, for notifications: each link as its own words, or its target's name. */
export function plainText(text: string, nameOf: (kind: LinkKind, id: string) => string | null = () => null): string {
  return tokenize(text)
    .map((s) => (s.type === 'entity' ? s.text || nameOf(s.kind, s.id) || 'a link' : s.type === 'link' ? s.text : s.text))
    .join('')
}
