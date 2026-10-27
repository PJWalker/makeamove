import { Node, mergeAttributes, type Editor, type JSONContent } from '@tiptap/core'
import CollaborationCaret from '@tiptap/extension-collaboration-caret'
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap'
import type { Awareness } from 'y-protocols/awareness'
import * as Y from 'yjs'
import { newId } from '../lib/ids'
import { colourOf } from '../scene/presence'
import { importImage, loadBlob, onBlobFetcher } from '../scene/images'
import type { BlobRef } from '../scene/types'
import { device } from '../store/device'

/*
 * What notes have beyond rich text (M6):
 *
 * - Live carets: each note has its own awareness (sync/session.ts), so you
 *   see where others are typing, in their colour, with their name.
 * - Images: stored by hash in the blob store, like maps, and fetched from
 *   peers when this device lacks them; only the reference is in the note.
 * - Secrets: paragraphs only the GM sees. The note keeps just a placeholder
 *   with an id; the text lives in the GM vault, which never reaches players'
 *   devices. The GM edits it in place and can reveal it, which moves the
 *   text into the note for everyone.
 */

export const IMAGE_NODE = 'noteImage'
export const SECRET_NODE = 'secret'

/** Live carets for the people editing this text with you. */
export function carets(awareness: Awareness, name: string) {
  const d = device.value
  return CollaborationCaret.configure({
    provider: { awareness },
    user: { name, color: colourOf(d) },
    render: (user) => {
      const caret = document.createElement('span')
      caret.className = 'note-caret'
      caret.style.setProperty('--caret', user.color)
      const label = document.createElement('span')
      label.className = 'note-caret-label'
      label.textContent = user.name
      caret.append(label)
      return caret
    },
  })
}

/** An image in a note: its blob reference as attributes, drawn from the blob store. */
export const NoteImage = Node.create({
  name: IMAGE_NODE,
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return { hash: { default: '' }, mime: { default: '' }, width: { default: 0 }, height: { default: 0 } }
  },
  parseHTML() {
    return [{ tag: `figure[data-type="${IMAGE_NODE}"]` }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['figure', mergeAttributes(HTMLAttributes, { 'data-type': IMAGE_NODE, class: 'note-image' })]
  },
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('figure')
      dom.className = 'note-image'
      dom.dataset.type = IMAGE_NODE
      const { hash, width, height } = node.attrs as BlobRef
      // Hold the space while it loads, so text doesn't jump.
      if (width && height) {
        dom.style.aspectRatio = `${width} / ${height}`
        dom.style.width = `${width}px`
      }
      const img = document.createElement('img')
      img.alt = ''
      img.draggable = false
      let url: string | null = null
      let gone = false
      const load = () =>
        loadBlob(hash).then((blob) => {
          if (gone || !blob || url) return
          url = URL.createObjectURL(blob)
          img.src = url
          dom.append(img)
          dom.dataset.loaded = 'true'
        })
      void load()
      const stop = onBlobFetcher(() => void load())
      return {
        dom,
        destroy() {
          gone = true
          stop()
          if (url) URL.revokeObjectURL(url)
        },
      }
    }
  },
})

/** Store image files and put them in the note at a position, in order. */
export async function insertImages(editor: Editor, files: File[], pos?: number) {
  const images = files.filter((f) => f.type.startsWith('image/'))
  for (const file of images) {
    const ref = await importImage(file)
    if (editor.isDestroyed) return
    const at = pos ?? editor.state.selection.to
    editor.chain().focus().insertContentAt(at, { type: IMAGE_NODE, attrs: ref }).run()
  }
}

/** Where a secret's text lives: a fragment of the GM vault's document, by the secret's id. */
export const secretFragment = (vault: Y.Doc, id: string) => vault.getXmlFragment(`secret:${id}`)

/**
 * A GM's secret: in the note, a block with only an id. The GM sees its text
 * from the vault, edited in place by a nested editor that `mountSecret`
 * supplies; players see nothing.
 */
export function secretNode(mountSecret: ((host: HTMLElement, id: string) => () => void) | null) {
  return Node.create({
    name: SECRET_NODE,
    group: 'block',
    atom: true,
    selectable: true,
    addAttributes() {
      return { id: { default: '' } }
    },
    parseHTML() {
      return [{ tag: `div[data-type="${SECRET_NODE}"]` }]
    },
    renderHTML({ HTMLAttributes }) {
      return ['div', mergeAttributes(HTMLAttributes, { 'data-type': SECRET_NODE })]
    },
    addNodeView() {
      return ({ node }) => {
        const dom = document.createElement('div')
        dom.dataset.type = SECRET_NODE
        dom.dataset.id = node.attrs.id
        if (!mountSecret) {
          dom.hidden = true
          return { dom }
        }
        dom.className = 'note-secret bevel'
        const label = document.createElement('span')
        label.className = 'note-secret-label eyebrow'
        label.textContent = 'Secret'
        label.contentEditable = 'false'
        const body = document.createElement('div')
        body.className = 'note-secret-body'
        dom.append(label, body)
        const unmount = mountSecret(body, node.attrs.id)
        return {
          dom,
          // The nested editor handles its own typing and selection.
          stopEvent: (e) => body.contains(e.target as globalThis.Node),
          ignoreMutation: () => true,
          destroy: unmount,
        }
      }
    },
  })
}

/** The top-level blocks the selection touches, as a range. */
function blockRange(editor: Editor): { from: number; to: number } | null {
  const { $from, $to } = editor.state.selection
  if ($from.depth < 1) return null
  return { from: $from.before(1), to: $to.after(1) }
}

/**
 * Turn the blocks around the selection into a secret: their text moves to
 * the vault, and the note keeps a placeholder.
 */
export function makeSecret(editor: Editor, vault: Y.Doc): boolean {
  const range = blockRange(editor)
  if (!range) return false
  const slice = editor.state.doc.slice(range.from, range.to)
  const content = slice.content.toJSON() as JSONContent[]
  if (content.some((n) => n.type === SECRET_NODE)) return false
  const id = newId()
  vault.transact(() => prosemirrorJSONToYXmlFragment(editor.schema, { type: 'doc', content }, secretFragment(vault, id)))
  editor.chain().focus().insertContentAt(range, { type: SECRET_NODE, attrs: { id } }).run()
  return true
}

/** Reveal a secret: its text goes into the note where it was, for everyone, and leaves the vault. */
export function revealSecret(editor: Editor, vault: Y.Doc, pos: number) {
  const node = editor.state.doc.nodeAt(pos)
  if (node?.type.name !== SECRET_NODE) return
  const fragment = secretFragment(vault, node.attrs.id)
  const json = yXmlFragmentToProsemirrorJSON(fragment) as JSONContent
  const content = json.content?.length ? json.content : [{ type: 'paragraph' }]
  editor.chain().focus().insertContentAt({ from: pos, to: pos + node.nodeSize }, content).run()
  vault.transact(() => fragment.delete(0, fragment.length))
}

/** Delete a secret from the note and the vault. */
export function deleteSecret(editor: Editor, vault: Y.Doc, pos: number) {
  const node = editor.state.doc.nodeAt(pos)
  if (node?.type.name !== SECRET_NODE) return
  const fragment = secretFragment(vault, node.attrs.id)
  editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run()
  vault.transact(() => fragment.delete(0, fragment.length))
}
