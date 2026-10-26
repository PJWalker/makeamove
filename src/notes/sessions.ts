import * as Y from 'yjs'
import type { Campaign } from '../store/campaign'
import { createNote, listNotes, noteSubdoc } from './api'
import { NoteDoc } from './noteDoc'

/*
 * One page per session in the Sessions folder, made when the GM starts the
 * session, with headings to fill in afterwards.
 */

/** The recap template: headings, each followed by an empty paragraph. */
const SECTIONS = ['Recap', 'Highlights', 'Loose threads']

/** The page for session `n`, if there is one. */
export function sessionPageId(campaign: Campaign, n: number): string | undefined {
  return listNotes(campaign).find((p) => campaign.notes.get(p.id)?.get('session') === n)?.id
}

/**
 * Make the page for session `n`, unless it already exists. Returns its id.
 * It goes in the Sessions folder while that folder exists.
 */
export async function makeSessionPage(campaign: Campaign, n: number): Promise<string> {
  const existing = sessionPageId(campaign, n)
  if (existing) return existing
  const folder = campaign.noteFolders.has('sessions') ? 'sessions' : undefined
  const id = createNote(campaign, { title: `Session ${n}`, folder })
  campaign.notes.get(id)!.set('session', n)

  const page = await NoteDoc.open(noteSubdoc(campaign, id)!)
  page.doc.transact(() => {
    const blocks = SECTIONS.flatMap((title) => {
      // The editor reads a heading's level as a number.
      const heading = new Y.XmlElement<Record<string, any>>('heading')
      heading.setAttribute('level', 2)
      heading.insert(0, [new Y.XmlText(title)])
      return [heading, new Y.XmlElement('paragraph')]
    })
    page.body.insert(0, blocks)
  })
  page.destroy()
  return id
}
