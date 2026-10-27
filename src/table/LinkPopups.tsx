import { useSignal } from '@preact/signals'
import type { ComponentChildren } from 'preact'
import { useLayoutEffect, useRef } from 'preact/hooks'
import { addItem, canEdit, getCharacter, selectedCharacterId, startMove, systemOf } from '../characters/api'
import { getNote } from '../notes/api'
import { followLink } from '../notes/targets'
import type { Campaign } from '../store/campaign'
import { useY } from '../store/useY'
import { Button } from '../ui/Button'
import { openPopup } from '../ui/popup'
import { Dialog } from './CampaignDialogs'
import { ContextMenu } from './ContextMenu'
import { EntryWindow, rollTag } from './EntryWindow'
import { closeLink, linkKey, linkMenu, linkRename, openLinks, type LinkRef } from './linkState'
import { NoteEditor } from './NoteEditor'
import { CharacterSheet } from './sheets'
import { linkProxy } from './LinkChip'
import { makeVerb } from './sheetParts'

/*
 * What links in rich text open: a pop-up for each link clicked (gear and
 * moves with their rules, a character's sheet, a scene, a note's page),
 * the links' right-click menu, and renaming a link.
 */

export function LinkPopups({ campaign }: { campaign: Campaign }) {
  return (
    <>
      {openLinks.value.map((l) => (
        <LinkPopup key={linkKey(l)} campaign={campaign} link={l} />
      ))}
      {linkMenu.value && <ContextMenu {...linkMenu.value} onClose={() => (linkMenu.value = null)} />}
      <RenameLink />
    </>
  )
}

/** A pop-up for one link, marked so clicking the link again brings it forward. */
function LinkDialog({ campaign, link, title, children }: { campaign: Campaign; link: LinkRef; title: string; children: ComponentChildren }) {
  const ref = useRef<HTMLDialogElement>(null)
  useLayoutEffect(() => {
    if (!ref.current) return
    ref.current.dataset.entry = `link:${linkKey(link)}`
    openPopup(ref.current)
  }, [])
  return (
    <Dialog dialogRef={ref} title={title} onClose={() => closeLink(link)} proxy={linkProxy(campaign, link.kind, link.id, title)}>
      {children}
    </Dialog>
  )
}

function LinkPopup({ campaign, link }: { campaign: Campaign; link: LinkRef }) {
  const system = systemOf(campaign)
  const close = () => closeLink(link)
  const entryKey = `link:${linkKey(link)}`
  // Gear and moves go to the character this device is playing, if they can change it.
  const me = useY(campaign.characters, () => getCharacter(campaign, selectedCharacterId(campaign)))
  const canAct = !!me && canEdit(campaign, me)
  const character = useY(campaign.characters, () => (link.kind === 'character' ? getCharacter(campaign, link.id) : undefined))
  const scene = useY(campaign.scenes, () => (link.kind === 'scene' ? campaign.sceneViews().find((s) => s.id === link.id) : undefined))
  const note = useY(campaign.notes, () => (link.kind === 'note' ? getNote(campaign, link.id) : undefined))

  switch (link.kind) {
    case 'item': {
      const item = system.items.find((i) => i.id === link.id)
      if (!item) return null
      return (
        <EntryWindow
          entryKey={entryKey}
          title={item.name}
          text={item.description}
          tags={item.tags}
          onClose={close}
          proxy={linkProxy(campaign, 'item', item.id, item.name, item.icon)}
        >
          <Button variant="primary" disabled={!canAct} onClick={() => me && addItem(campaign, me.id, item)}>
            {me ? `Give to ${me.name}` : 'Choose a character first'}
          </Button>
        </EntryWindow>
      )
    }
    case 'move': {
      const move = system.actions.find((m) => m.id === link.id)
      if (!move) return null
      const { label, Icon } = makeVerb(move)
      const tag = rollTag(system, move)
      return (
        <EntryWindow
          entryKey={entryKey}
          title={move.name}
          text={move.text}
          tags={tag ? [tag] : undefined}
          onClose={close}
          proxy={linkProxy(campaign, 'move', move.id, move.name, move.category === 'class' ? 'class-move' : undefined)}
        >
          <Button variant="primary" disabled={!canAct} onClick={() => me && startMove(campaign, me.id, move)}>
            <Icon size={18} /> {label}
            {me ? ` as ${me.name}` : ''}
          </Button>
        </EntryWindow>
      )
    }
    case 'character':
      return character ? (
        <LinkDialog campaign={campaign} link={link} title={character.name}>
          <div class="popup-sheet sheet-panel">
            <CharacterSheet campaign={campaign} system={system} c={character} />
          </div>
        </LinkDialog>
      ) : null
    case 'scene':
      return scene ? (
        <LinkDialog campaign={campaign} link={link} title={scene.name}>
          <p class="muted">A scene in this campaign.</p>
          <div class="form-actions">
            <Button variant="primary" onClick={() => followLink(campaign, 'scene', scene.id)}>
              Go to scene
            </Button>
          </div>
        </LinkDialog>
      ) : null
    case 'note':
      return note ? (
        <LinkDialog campaign={campaign} link={link} title={note.title || 'Untitled'}>
          <div class="link-note">
            <NoteEditor campaign={campaign} noteId={note.id} />
          </div>
        </LinkDialog>
      ) : null
  }
}

/** Change what a link says, or put its target's own name back. */
function RenameLink() {
  const req = linkRename.value
  // A new pop-up for each request, opened as it mounts so the menu item's morph catches it.
  return req ? <RenameLinkDialog key={req.n} req={req} /> : null
}

function RenameLinkDialog({ req }: { req: NonNullable<typeof linkRename.value> }) {
  const ref = useRef<HTMLDialogElement>(null)
  const text = useSignal(req.text)
  useLayoutEffect(() => openPopup(ref.current), [])
  const done = (value: string | null) => {
    req.save(value)
    ref.current?.close()
  }
  return (
    <Dialog dialogRef={ref} title="Link text" onClose={() => (linkRename.value = null)}>
      <form
        class="dialog-form"
        onSubmit={(e) => {
          e.preventDefault()
          done(text.value)
        }}
      >
        <label class="field">
          Show this link as
          <input
            class="input bevel"
            value={text.value}
            autoFocus
            // Typing replaces it.
            onFocus={(e) => e.currentTarget.select()}
            onInput={(e) => (text.value = e.currentTarget.value)}
          />
        </label>
        <div class="form-actions">
          {req.custom && (
            <Button variant="ghost" onClick={() => done(null)}>
              Use its own name
            </Button>
          )}
          <Button variant="primary" type="submit">
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
