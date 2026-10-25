/*
 * Markdown-lite for chat: **bold**, *italic* or _italic_, `code`,
 * [label](https://…) and bare links. It produces segments, never HTML, so
 * nothing a player types can inject markup. Styles don't nest.
 */

export type Segment =
  | { type: 'text' | 'bold' | 'italic' | 'code'; text: string }
  | { type: 'link'; text: string; href: string }

const PATTERN =
  /`([^`\n]+)`|\*\*([^*\n]+)\*\*|\*([^*\s][^*\n]*?)\*|(?<![\w])_([^_\s][^_\n]*?)_(?![\w])|\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)|((?:https?:\/\/)[^\s<>()]+[^\s<>().,;:!?'"])/g

export function tokenize(text: string): Segment[] {
  const out: Segment[] = []
  let last = 0
  for (const m of text.matchAll(PATTERN)) {
    if (m.index > last) out.push({ type: 'text', text: text.slice(last, m.index) })
    if (m[1] !== undefined) out.push({ type: 'code', text: m[1] })
    else if (m[2] !== undefined) out.push({ type: 'bold', text: m[2] })
    else if (m[3] !== undefined) out.push({ type: 'italic', text: m[3] })
    else if (m[4] !== undefined) out.push({ type: 'italic', text: m[4] })
    else if (m[5] !== undefined) out.push({ type: 'link', text: m[5], href: m[6] })
    else out.push({ type: 'link', text: m[7], href: m[7] })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) })
  return out
}
