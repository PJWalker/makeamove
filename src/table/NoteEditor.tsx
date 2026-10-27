import type { Editor } from '@tiptap/core'
import { useEffect, useRef, useState } from 'preact/hooks'
import { getNote, noteSubdoc, touchNote } from '../notes/api'
import { NoteDoc } from '../notes/noteDoc'
import { linksIn } from '../notes/links'
import type { Campaign } from '../store/campaign'
import { mountRichText } from './richText'
import { Awareness } from 'y-protocols/awareness'
import { myName } from '../chat/send'

/** How long after the last keystroke a page records its links and edit time. */
const TOUCH_MS = 800

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
    let rich: ReturnType<typeof mountRichText> | null = null
    let timer = 0

    let local: Awareness | null = null
    void NoteDoc.open(sub).then((n) => {
      if (cancelled) return n.destroy()
      note = n
      const gmOnly = !!getNote(campaign, noteId)?.gmOnly
      // Carets travel with the page's own sync: the campaign's, or for a GM page the vault's.
      const session = gmOnly ? campaign.vault.value?.sync : campaign.sync
      const awareness = session?.awarenessFor(sub) ?? (local = new Awareness(sub))
      rich = mountRichText(host, {
        carets: { awareness, name: myName(campaign) },
        // A GM page is secret already; a shared page's secrets are the vault's.
        ...(gmOnly ? {} : { secrets: { vault: campaign.isGm() ? (campaign.vault.value?.doc ?? null) : null } }),
        campaign,
        fragment: n.body,
        placeholder: 'Write here. Type @ to link a note, character, scene, item or move.',
        label: 'Note text',
        noteId,
        shared: !getNote(campaign, noteId)?.gmOnly,
        onLocalEdit: (ed) => {
          clearTimeout(timer)
          timer = window.setTimeout(() => touchNote(campaign, noteId, linksIn(ed.getJSON())), TOUCH_MS)
        },
      })
      editor = rich.editor
      setLoading(false)
    })

    return () => {
      cancelled = true
      // Record any edit still waiting, then let go of the page.
      if (timer && editor) {
        clearTimeout(timer)
        touchNote(campaign, noteId, linksIn(editor.getJSON()))
      }
      rich?.destroy()
      local?.destroy()
      note?.destroy()
    }
  }, [campaign, noteId])

  return (
    <div class="note-editor" data-loading={loading || undefined}>
      <div ref={hostRef} />
    </div>
  )
}
