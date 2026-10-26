import { Editor, mergeAttributes } from '@tiptap/core'
import Collaboration from '@tiptap/extension-collaboration'
import Mention from '@tiptap/extension-mention'
import Placeholder from '@tiptap/extension-placeholder'
import StarterKit from '@tiptap/starter-kit'
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion'
import { ySyncPluginKey } from '@tiptap/y-tiptap'
import { render } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { getNote, noteSubdoc, touchNote, type LinkKind } from '../notes/api'
import { NoteDoc } from '../notes/noteDoc'
import { LINK_NODE, linksIn } from '../notes/links'
import { followLink, linkLabel, linkTargets, type LinkTarget } from '../notes/targets'
import type { Campaign } from '../store/campaign'
import { entryIcon } from '../ui/entryIcons'
import { IconCharacters, IconMap, IconNotes, type Icon } from '../ui/icons'

/** How long after the last keystroke a page records its links and edit time. */
const TOUCH_MS = 800

const KIND_ICON: Partial<Record<LinkKind, Icon>> = { note: IconNotes, character: IconCharacters, scene: IconMap }
const iconFor = (t: { kind: LinkKind; icon?: string }) => KIND_ICON[t.kind] ?? entryIcon(t.kind === 'item' ? 'item' : 'move', t.icon)

/**
 * A link to a note, character, scene, item or move: an inline chip, typed
 * by starting with `[[`. It stores its target's kind and id (and the name it
 * had, as a fallback); it shows the target's current name.
 */
function linkExtension(campaign: Campaign, noteId: string) {
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
    renderText: ({ node }) => `[[${node.attrs.label ?? node.attrs.id}]]`,
    suggestion: {
      char: '[[',
      allowSpaces: true,
      allowedPrefixes: null,
      items: ({ query }) => linkTargets(campaign, query, noteId),
      command: ({ editor, range, props }) => {
        const t = props as unknown as LinkTarget
        // A shared page mustn't carry a GM-only page's title where players could read it.
        const label = t.gmOnly && !getNote(campaign, noteId)?.gmOnly ? '' : t.label
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

/** The list that drops down after `[[`: arrow keys move, Enter or Tab picks, Escape closes. */
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

/** A note's text, edited together: anyone at the table can write in it. */
export function NoteEditor({ campaign, noteId }: { campaign: Campaign; noteId: string }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const host = hostRef.current
    const sub = noteSubdoc(campaign, noteId)
    if (!host || !sub) return
    let cancelled = false
    let note: NoteDoc | null = null
    let editor: Editor | null = null
    let timer = 0

    void NoteDoc.open(sub).then((n) => {
      if (cancelled) return n.destroy()
      note = n
      editor = new Editor({
        element: host,
        extensions: [
          // Yjs keeps the history, so undo only takes back your own edits.
          StarterKit.configure({ undoRedo: false, link: false }),
          Collaboration.configure({ fragment: n.body }),
          Placeholder.configure({ placeholder: 'Write here. Type [[ to link a note, character, scene, item or move.' }),
          linkExtension(campaign, noteId),
        ],
        editorProps: { attributes: { class: 'note-body', 'aria-label': 'Note text' } },
        onUpdate: ({ editor: ed, transaction }) => {
          // Edits that arrived from peers are theirs to record.
          if (transaction.getMeta(ySyncPluginKey)?.isChangeOrigin) return
          clearTimeout(timer)
          timer = window.setTimeout(() => touchNote(campaign, noteId, linksIn(ed.getJSON())), TOUCH_MS)
        },
      })
      setLoading(false)
    })

    // Following a link chip.
    const onClick = (e: MouseEvent) => {
      const chip = (e.target as Element).closest<HTMLElement>(`[data-type="${LINK_NODE}"]`)
      if (!chip || chip.dataset.missing) return
      e.preventDefault()
      followLink(campaign, chip.dataset.kind as LinkKind, chip.dataset.id ?? '')
    }
    host.addEventListener('click', onClick)

    return () => {
      cancelled = true
      host.removeEventListener('click', onClick)
      // Record any edit still waiting, then let go of the page.
      if (timer && editor) {
        clearTimeout(timer)
        touchNote(campaign, noteId, linksIn(editor.getJSON()))
      }
      editor?.destroy()
      note?.destroy()
    }
  }, [campaign, noteId])

  return (
    <div class="note-editor" data-loading={loading || undefined}>
      <div ref={hostRef} />
    </div>
  )
}
