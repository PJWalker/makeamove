import { Editor, mergeAttributes } from '@tiptap/core'
import Collaboration from '@tiptap/extension-collaboration'
import Mention from '@tiptap/extension-mention'
import Placeholder from '@tiptap/extension-placeholder'
import StarterKit from '@tiptap/starter-kit'
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion'
import { ySyncPluginKey } from '@tiptap/y-tiptap'
import { render } from 'preact'
import type * as Y from 'yjs'
import type { Awareness } from 'y-protocols/awareness'
import { IconDelete, IconImage, IconReveal, IconSecret } from '../ui/icons'
import { carets, deleteSecret, insertImages, makeSecret, NoteImage, revealSecret, secretFragment, secretNode, SECRET_NODE } from './noteExtensions'
import { getNote, type LinkKind } from '../notes/api'
import { LINK_NODE } from '../notes/links'
import { followLink, linkLabel, linkTargets, linkTip, openInSidebar, type LinkTarget } from '../notes/targets'
import { menuTrigger } from '../ui/menuTrigger'
import type { MenuItem } from './ContextMenu'
import { linkMenu, renameLink, showLink } from './linkState'
import type { Campaign } from '../store/campaign'
import { placeAnchored } from '../ui/anchor'
import { entryIcon } from '../ui/entryIcons'
import { IconCharacters, IconMap, IconNotes, IconOpenWindow, IconRename, IconSidebar, type Icon } from '../ui/icons'
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
  /** Others editing the same text, to show their carets, and the name to show for yours. */
  carets?: { awareness: Awareness; name: string }
  /**
   * A note's secrets: the GM vault's document, where their text lives, or
   * null for a player, who sees none of them. Absent where text has no
   * secrets (sheets, chat, a secret's own text).
   */
  secrets?: { vault: Y.Doc | null }
}

const KIND_ICON: Partial<Record<LinkKind, Icon>> = { note: IconNotes, character: IconCharacters, scene: IconMap }
/** A link target's icon: notes, characters and scenes by kind; gear and moves by their own icon. */
export const linkIcon = (t: { kind: LinkKind; icon?: string }) => KIND_ICON[t.kind] ?? entryIcon(t.kind === 'item' ? 'item' : 'move', t.icon)

/**
 * A link to a note, character, scene, item or move: an inline chip, typed
 * by starting a word with `@`. It stores its target's kind and id (and the
 * name it had, as a fallback); it shows the target's current name.
 */
export function linkExtension(campaign: Campaign, o: Pick<RichTextOptions, 'noteId' | 'shared'>) {
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
        /** Text chosen for the link, shown instead of its target's name. */
        text: {
          default: null,
          parseHTML: (el: HTMLElement) => el.getAttribute('data-text'),
          renderHTML: (attrs: { text: string | null }) => (attrs.text ? { 'data-text': attrs.text } : {}),
        },
      }
    },
  }).configure({
    renderHTML: ({ node }) => {
      const { kind, id, label, text } = node.attrs as { kind: LinkKind; id: string; label?: string; text?: string | null }
      const current = linkLabel(campaign, kind, id)
      const tip = current === null ? 'Not available' : linkTip(campaign, kind, id)
      return [
        'span',
        mergeAttributes({
          class: 'note-link bevel',
          'data-type': LINK_NODE,
          'data-kind': kind,
          'data-id': id,
          'data-label': label,
          'data-missing': current === null ? 'true' : undefined,
          'data-tip': tip ?? undefined,
          'data-tip-long': current === null ? undefined : 'true',
          // Clicking turns the tooltip into the link's pop-up.
          'data-tip-opens': current === null ? undefined : 'true',
        }),
        text || current || label || 'Unavailable',
      ]
    },
    renderText: ({ node }) => `@${node.attrs.text || node.attrs.label || node.attrs.id}`,
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

  // Under the text being typed, or over it near the bottom of the window.
  const place = () => {
    const r = props?.clientRect?.()
    if (r) placeAnchored(host, r)
  }
  const draw = () => {
    if (!props) return
    const items = props.items
    render(
      items.length ? (
        <>
          {items.map((t, i) => {
            const Icon = linkIcon(t)
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
        <p class="empty-inline note-suggest-empty">Nothing by that name.</p>
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


/** Ask for image files and put them in at the cursor. */
function pickImages(editor: Editor) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.multiple = true
  input.onchange = () => void insertImages(editor, [...(input.files ?? [])])
  input.click()
}

/** Put a rich-text editor in `host`; returns it and a function that takes it down. */
export function mountRichText(host: HTMLElement, o: RichTextOptions): { editor: Editor; destroy: () => void } {
  const { campaign } = o
  const vault = o.secrets?.vault ?? null
  /** A secret's own text, edited in place inside the note (GM only). */
  const mountSecret = (body: HTMLElement, id: string, doc: Y.Doc): (() => void) => {
    const nested = mountRichText(body, {
      campaign,
      fragment: secretFragment(doc, id),
      placeholder: 'Only you can see this.',
      label: 'Secret text',
      editable: o.editable,
      noteId: o.noteId,
      shared: false,
    })
    return nested.destroy
  }
  const editor: Editor = new Editor({
    element: host,
    editable: o.editable ?? true,
    extensions: [
      // Yjs keeps the history, so undo only takes back your own edits.
      StarterKit.configure({ undoRedo: false, link: false }),
      Collaboration.configure({ fragment: o.fragment }),
      Placeholder.configure({ placeholder: o.placeholder }),
      linkExtension(campaign, o),
      NoteImage,
      ...(o.carets ? [carets(o.carets.awareness, o.carets.name)] : []),
      ...(o.secrets ? [secretNode(vault ? (host, id) => mountSecret(host, id, vault) : null)] : []),
    ],
    editorProps: {
      attributes: { class: 'note-body', 'aria-label': o.label },
      // Image files pasted or dropped in are stored and shown in place.
      handlePaste: (_view, e) => {
        const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'))
        if (!files.length || !editor.isEditable) return false
        void insertImages(editor, files)
        return true
      },
      handleDrop: (view, e) => {
        const files = [...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/'))
        if (!files.length || !editor.isEditable) return false
        e.preventDefault()
        void insertImages(editor, files, view.posAtCoords({ left: e.clientX, top: e.clientY })?.pos)
        return true
      },
    },
    onUpdate: ({ editor: ed, transaction }) => {
      // Edits that arrived from peers are theirs to record.
      if (transaction.getMeta(ySyncPluginKey)?.isChangeOrigin) return
      o.onLocalEdit?.(ed)
    },
  })

  const chipAt = (e: Event) => (e.target as Element).closest<HTMLElement>(`[data-type="${LINK_NODE}"]`)
  const refOf = (chip: HTMLElement) => ({ kind: chip.dataset.kind as LinkKind, id: chip.dataset.id ?? '' })
  /** Opening a link: a note links on to another page in the Notes panel; anything else opens a pop-up. */
  const followsInPlace = (kind: LinkKind) => kind === 'note' && !!o.noteId

  // Clicking a link chip.
  const onClick = (e: MouseEvent) => {
    const chip = chipAt(e)
    if (!chip || chip.dataset.missing) return
    e.preventDefault()
    const link = refOf(chip)
    if (followsInPlace(link.kind)) followLink(campaign, link.kind, link.id)
    else showLink(link, chip)
  }
  host.addEventListener('click', onClick)

  /** The link node a chip draws, and where it is, so it can be changed. */
  const nodeOf = (chip: HTMLElement) => {
    const at = editor.view.posAtDOM(chip, 0)
    for (const pos of [at, at - 1]) {
      const node = pos >= 0 ? editor.state.doc.nodeAt(pos) : null
      if (node?.type.name === LINK_NODE) return { pos, node }
    }
    return null
  }

  // Right-clicking text: add an image; for the GM, make it secret, or reveal or delete a secret.
  const textMenu = menuTrigger((x, y) => {
    if (!editor.isEditable) return
    const items: MenuItem[] = [{ label: 'Insert image…', Icon: IconImage, onSelect: () => pickImages(editor) }]
    if (vault) {
      const secret = menuSecret
      if (secret) {
        const pos = editor.view.posAtDOM(secret, 0)
        items.push('divider', { label: 'Reveal to players', Icon: IconReveal, onSelect: () => revealSecret(editor, vault, pos) })
        items.push({ label: 'Delete secret', Icon: IconDelete, danger: true, onSelect: () => deleteSecret(editor, vault, pos) })
      } else {
        items.push('divider', { label: 'Make secret', Icon: IconSecret, onSelect: () => makeSecret(editor, vault) })
      }
    }
    linkMenu.value = { x, y, items }
  })
  let menuSecret: HTMLElement | null = null

  // Right-clicking a link chip: open it elsewhere, or change what it says.
  const menu = menuTrigger((x, y) => {
    const chip = menuChip
    if (!chip) return
    const link = refOf(chip)
    const found = nodeOf(chip)
    const items: MenuItem[] = []
    if (!chip.dataset.missing) {
      items.push({ label: 'Open in sidebar', Icon: IconSidebar, onSelect: () => openInSidebar(campaign, link.kind, link.id) })
      if (followsInPlace(link.kind)) items.push({ label: 'Open in a window', Icon: IconOpenWindow, onSelect: () => showLink(link, chip) })
    }
    if (found && editor.isEditable) {
      const custom = !!found.node.attrs.text
      if (items.length) items.push('divider')
      items.push({
        label: 'Edit link text…',
        Icon: IconRename,
        onSelect: () =>
          renameLink({
            text: chip.textContent ?? '',
            custom,
            save: (text) => {
              const now = nodeOf(chip) ?? found
              editor.view.dispatch(editor.state.tr.setNodeMarkup(now.pos, undefined, { ...now.node.attrs, text: text?.trim() || null }))
            },
          }),
      })
    }
    if (items.length) linkMenu.value = { x, y, items }
  })
  let menuChip: HTMLElement | null = null
  /** Whether a press is for the text menu: in this editor's own text, not a nested secret's, with notes' extras on. */
  const ownText = (e: Event) => {
    if (!o.secrets) return false
    const secret = (e.target as Element).closest<HTMLElement>(`[data-type="${SECRET_NODE}"]`)
    // A secret's text has its own editor and menu; its label is this one's.
    if (secret && !(e.target as Element).closest('.note-secret-label')) return false
    menuSecret = secret
    return true
  }
  const onMenuPress = (e: PointerEvent) => {
    menuChip = chipAt(e)
    if (menuChip) menu.onPointerDown(e)
    else if (ownText(e)) textMenu.onPointerDown(e)
  }
  const onContextMenu = (e: MouseEvent) => {
    menuChip = chipAt(e)
    if (menuChip) menu.onContextMenu(e)
    else if (ownText(e)) textMenu.onContextMenu(e)
  }
  host.addEventListener('pointerdown', onMenuPress)
  host.addEventListener('contextmenu', onContextMenu)

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
      host.removeEventListener('pointerdown', onMenuPress)
      host.removeEventListener('contextmenu', onContextMenu)
      stopLinkDrop()
      editor.destroy()
    },
  }
}
