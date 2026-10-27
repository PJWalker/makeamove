import { Editor, Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import Placeholder from '@tiptap/extension-placeholder'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useRef } from 'preact/hooks'
import { entityToken } from '../chat/markdown'
import type { LinkKind } from '../notes/api'
import { LINK_NODE } from '../notes/links'
import type { Campaign } from '../store/campaign'
import { registerLinkDrop } from './entityDrag'
import { linkExtension } from './richText'

/*
 * The chat's message box: plain text (chat has its own markdown-lite and
 * commands), plus links typed with @ or dragged in, which are sent as
 * @[text](kind:id) (see chat/markdown.ts). Enter sends; Shift+Enter starts
 * a new line.
 */

/** A message box's text as chat text: lines joined, links as tokens. */
export function chatText(doc: PMNode): string {
  const lines: string[] = []
  doc.forEach((block) => {
    let line = ''
    block.descendants((n) => {
      if (n.isText) line += n.text
      else if (n.type.name === 'hardBreak') line += '\n'
      else if (n.type.name === LINK_NODE) line += entityToken(n.attrs.kind as LinkKind, n.attrs.id, n.attrs.text ?? '')
    })
    lines.push(line)
  })
  return lines.join('\n')
}

export interface ChatInputHandle {
  /** Replace the text (plain, as typed). */
  set(text: string): void
  focus(): void
}

export function ChatInput({
  campaign,
  placeholder,
  label,
  invalid,
  onChange,
  onEnter,
  onUp,
  onEscape,
  handle,
}: {
  campaign: Campaign
  placeholder: string
  label: string
  invalid: boolean
  /** The text as it changes, links as tokens. */
  onChange: (text: string) => void
  onEnter: () => void
  /** Up arrow in an empty box. */
  onUp: () => void
  onEscape: () => void
  handle: { current: ChatInputHandle | null }
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  // Callbacks change every render; the editor reads the latest.
  const cb = useRef({ onChange, onEnter, onUp, onEscape })
  cb.current = { onChange, onEnter, onUp, onEscape }

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const keys = Extension.create({
      name: 'chatKeys',
      // Before the editor's own Enter (a new paragraph); the @ list keeps its keys while it's open.
      priority: 1000,
      addKeyboardShortcuts() {
        const listOpen = () => !!document.querySelector('.note-suggest')
        return {
          Enter: () => {
            if (listOpen()) return false
            cb.current.onEnter()
            return true
          },
          ArrowUp: ({ editor }) => {
            if (!editor.isEmpty || listOpen()) return false
            cb.current.onUp()
            return true
          },
          Escape: ({ editor }) => {
            if (editor.isEmpty || listOpen()) return false
            cb.current.onEscape()
            return true
          },
        }
      },
    })
    const editor = new Editor({
      element: host,
      extensions: [
        // Just text and line breaks: chat's own markdown does the rest.
        StarterKit.configure({
          heading: false,
          blockquote: false,
          codeBlock: false,
          bulletList: false,
          orderedList: false,
          listItem: false,
          listKeymap: false,
          horizontalRule: false,
          bold: false,
          italic: false,
          strike: false,
          code: false,
          underline: false,
          link: false,
        }),
        Placeholder.configure({ placeholder }),
        linkExtension(campaign, { shared: true }),
        keys,
      ],
      editorProps: { attributes: { class: 'chat-input-body', 'aria-label': label, role: 'textbox', 'aria-multiline': 'true' } },
      onUpdate: ({ editor: ed }) => cb.current.onChange(chatText(ed.state.doc)),
    })
    handle.current = {
      set: (text) => {
        editor.commands.setContent(text ? { type: 'doc', content: text.split('\n').map((l) => ({ type: 'paragraph', content: l ? [{ type: 'text', text: l }] : [] })) } : '')
        editor.commands.focus('end')
        cb.current.onChange(chatText(editor.state.doc))
      },
      focus: () => editor.commands.focus(),
    }
    // Something dragged in becomes a link where it's dropped.
    const stop = registerLinkDrop(host, (link, x, y) => {
      const pos = editor.view.posAtCoords({ left: x, top: y })?.pos ?? editor.state.doc.content.size
      editor
        .chain()
        .focus()
        .insertContentAt(pos, [
          { type: LINK_NODE, attrs: { kind: link.kind, id: link.id, label: link.label } },
          { type: 'text', text: ' ' },
        ])
        .run()
    })
    return () => {
      stop()
      handle.current = null
      editor.destroy()
    }
  }, [campaign])

  return <div ref={hostRef} class="input bevel chat-input" aria-invalid={invalid} />
}
