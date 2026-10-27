import { Editor, mergeAttributes } from '@tiptap/core'
import Collaboration from '@tiptap/extension-collaboration'
import Mention from '@tiptap/extension-mention'
import Placeholder from '@tiptap/extension-placeholder'
import StarterKit from '@tiptap/starter-kit'
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion'
import { ySyncPluginKey } from '@tiptap/y-tiptap'
import { render } from 'preact'
import type * as Y from 'yjs'
import { getNote, type LinkKind } from '../notes/api'
import { LINK_NODE } from '../notes/links'
import { followLink, linkLabel, linkTargets, type LinkTarget } from '../notes/targets'
import type { Campaign } from '../store/campaign'
import { entryIcon } from '../ui/entryIcons'
import { IconCharacters, IconMap, IconNotes, type Icon } from '../ui/icons'
import { dragEntity, entity, registerLinkDrop } from './entityDrag'

/*
 * Rich text edited together: notes, and the long text on character sheets.
 * Markdown-style shortcuts format it (# for headings, ** for bold, - for
 * lists), and typing @ links a note, character, scene, item or move. Link
 * chips can be clicked to follow them or dragged onto characters, the
 * hotbar or other text; anything dragged in becomes a link.
 */

export interface RichTextOptions {
  campaign: Campaign
  /** The Yjs fragment holding the text. */
  fragment: Y.XmlFragment
  placeholder: string
  /** Its accessible name. */
  label: string
  editable?: boolean
  /** The note being edited, so it doesn't offer itself as a link. */
  noteId?: string
  /** Players can read it: links to GM-only pages leave their titles off. */
  shared: boolean
  /** After each edit made here (not ones arriving from peers). */
  onLocalEdit?: (editor: Editor) => void
}

const KIND_ICON: Partial<Record<LinkKind, Icon>> = { note: IconNotes, character: IconCharacters, scene: IconMap }
const iconFor = (t: { kind: LinkKind; icon?: string }) => KIND_ICON[t.kind] ?? entryIcon(t.kind === 'item' ? 'item' : 'move', t.icon)

/**
 * A link to a note, character, scene, item or move: an inline chip, typed
 * by starting a word with `@`. It stores its target's kind and id (and the
 * name it had, as a fallback); it shows the target's current name.
 */
function linkExtension(campaign: Campaign, o: Pick<RichTextOptions, 'noteId' | 'shared'>) {
  return Mention.extend({
    name: LINK_NODE,
    addAttributes() {
      return {
        ...this.parent?.(),
        kind: {
          default: 'note',
          parseHTML: (el: HTMLElement) => el.getAttribute('data-kind'),
          renderHTML: (attrs: { kind: string }) => ({ 'data-kind': attrs.kind }),
        },
      }
    },
  }).configure({
    renderHTML: ({ node }) => {
      const { kind, id, label } = node.attrs as { kind: LinkKind; id: string; label?: string }
      const current = linkLabel(campaign, kind, id)
      return [
        'span',
        mergeAttributes({
          class: 'note-link bevel',
          'data-type': LINK_NODE,
          'data-kind': kind,
          'data-id': id,
          'data-label': label,
          'data-missing': current === null ? 'true' : undefined,
          'data-tip': current === null ? 'Not available' : undefined,
        }),
        current ?? (label || 'Unavailable'),
      ]
    },
    renderText: ({ node }) => `@${node.attrs.label ?? node.attrs.id}`,
    suggestion: {
      char: '@',
      allowSpaces: true,
      items: ({ query }) => linkTargets(campaign, query, o.noteId),
      command: ({ editor, range, props }) => {
        const t = props as unknown as LinkTarget
        // Shared text mustn't carry a GM-only page's title where players could read it.
        const label = t.gmOnly && o.shared ? '' : t.label
        editor
          .chain()
          .focus()
          .insertContentAt(range, [
            { type: LINK_NODE, attrs: { kind: t.kind, id: t.id, label } },
            { type: 'text', text: ' ' },
          ])
          .run()
      },
      render: suggestionList,
    },
  })
}

/** The list that drops down after `@`: arrow keys move, Enter or Tab picks, Escape closes. */
function suggestionList() {
  const host = document.createElement('div')
  host.className = 'note-suggest context-menu panel bevel'
  host.setAttribute('role', 'listbox')
  let props: SuggestionProps<LinkTarget> | null = null
  let index = 0

  const place = () => {
    const r = props?.clientRect?.()
    if (!r) return
    host.style.left = `${Math.round(Math.min(r.left, innerWidth - host.offsetWidth - 8))}px`
    host.style.top = `${Math.round(r.bottom + 6)}px`
  }
  const draw = () => {
    if (!props) return
    const items = props.items
    render(
      items.length ? (
        <>
          {items.map((t, i) => {
            const Icon = iconFor(t)
            return (
              <button
                key={`${t.kind}:${t.id}`}
                type="button"
                role="option"
                class="menu-item bevel"
                aria-selected={i === index}
                data-active={i === index || undefined}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => props?.command(t)}
              >
                <Icon size={16} />
                <span class="menu-label">{t.label}</span>
                <span class="menu-shortcut">{t.detail}</span>
              </button>
            )
          })}
        </>
      ) : (
        <p class="muted note-suggest-empty">Nothing by that name</p>
      ),
      host,
    )
    place()
  }

  return {
    onStart(p: SuggestionProps<LinkTarget>) {
      props = p
      index = 0
      document.body.appendChild(host)
      draw()
    },
    onUpdate(p: SuggestionProps<LinkTarget>) {
      props = p
      index = Math.min(index, Math.max(0, p.items.length - 1))
      draw()
    },
    onKeyDown({ event }: SuggestionKeyDownProps) {
      const n = props?.items.length ?? 0
      if (event.key === 'Escape') {
        host.remove()
        return true
      }
      if (!n) return false
      if (event.key === 'ArrowDown') index = (index + 1) % n
      else if (event.key === 'ArrowUp') index = (index - 1 + n) % n
      else if (event.key === 'Enter' || event.key === 'Tab') {
        props?.command(props.items[index])
        return true
      } else return false
      draw()
      return true
    },
    onExit() {
      render(null, host)
      host.remove()
      props = null
    },
  }
}


/** Put a rich-text editor in `host`; returns it and a function that takes it down. */
export function mountRichText(host: HTMLElement, o: RichTextOptions) {
  const { campaign } = o
  const editor = new Editor({
    element: host,
    editable: o.editable ?? true,
    extensions: [
      // Yjs keeps the history, so undo only takes back your own edits.
      StarterKit.configure({ undoRedo: false, link: false }),
      Collaboration.configure({ fragment: o.fragment }),
      Placeholder.configure({ placeholder: o.placeholder }),
      linkExtension(campaign, o),
    ],
    editorProps: { attributes: { class: 'note-body', 'aria-label': o.label } },
    onUpdate: ({ editor: ed, transaction }) => {
      // Edits that arrived from peers are theirs to record.
      if (transaction.getMeta(ySyncPluginKey)?.isChangeOrigin) return
      o.onLocalEdit?.(ed)
    },
  })

  // Following a link chip.
  const onClick = (e: MouseEvent) => {
    const chip = (e.target as Element).closest<HTMLElement>(`[data-type="${LINK_NODE}"]`)
    if (!chip || chip.dataset.missing) return
    e.preventDefault()
    followLink(campaign, chip.dataset.kind as LinkKind, chip.dataset.id ?? '')
  }
  host.addEventListener('click', onClick)

  // Dragging a link chip out: onto a character (gear and moves), the hotbar or other text.
  const onPointerDown = (e: PointerEvent) => {
    const chip = (e.target as Element).closest<HTMLElement>(`[data-type="${LINK_NODE}"]`)
    if (!chip || chip.dataset.missing || e.button !== 0) return
    // Keep the editor from starting a text selection; a click still follows the link.
    e.preventDefault()
    dragEntity(e, entity(campaign, chip.dataset.kind as LinkKind, chip.dataset.id ?? '', chip.textContent ?? ''), chip)
  }
  host.addEventListener('pointerdown', onPointerDown)

  // Anything dragged in (from a list, the palette, the hotbar or other text) becomes a link where it's dropped.
  const stopLinkDrop =
    o.editable === false
      ? () => {}
      : registerLinkDrop(host, (dropped, x, y) => {
          const gmPage = dropped.kind === 'note' && getNote(campaign, dropped.id)?.gmOnly && o.shared
          const pos = editor.view.posAtCoords({ left: x, top: y })?.pos ?? editor.state.doc.content.size
          editor
            .chain()
            .focus()
            .insertContentAt(pos, [
              { type: LINK_NODE, attrs: { kind: dropped.kind, id: dropped.id, label: gmPage ? '' : dropped.label } },
              { type: 'text', text: ' ' },
            ])
            .run()
        })

  return {
    editor,
    destroy() {
      host.removeEventListener('click', onClick)
      host.removeEventListener('pointerdown', onPointerDown)
      stopLinkDrop()
      editor.destroy()
    },
  }
}
