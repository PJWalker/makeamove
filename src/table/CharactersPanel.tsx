import { useSignal } from '@preact/signals'
import { useEffect, useRef } from "preact/hooks";
import {
  canEdit,
  createFolder,
  deleteFolder,
  listCharacters,
  listFolders,
  moveToFolder,
  deleteCharacter,
  newCharacter,
  newNpc,
  renameFolder,
  type FolderView,
  getCharacter,
  selectCharacter,
  selectedCharacterId,
  systemOf,
} from '../characters/api'
import type { CharacterView } from '../characters/store'
import type { Campaign } from '../store/campaign'
import { useY } from '../store/useY'
import type { GameSystem } from '../systems/types'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { menuTrigger } from '../ui/menuTrigger'
import { usePopupDialog } from "./usePopupDialog";
import { choicesAt } from '../characters/creation'
import { ChoiceField, creationResult, emptyPick, ScoreFields, scoreMethods, scoresReady, startingScores, type Picked, type ScoreMethod } from './CreationParts'
import { IconDelete, IconFolder, IconRename } from '../ui/icons'
import { Segmented } from '../ui/Segmented'
import { Dialog } from './CampaignDialogs'
import { FolderName } from '../ui/FolderName'
import { createPaneLayout, TwoPane, usePaneLevel } from '../ui/TwoPane'
import { List, ListGroup, ListRow } from '../ui/List'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { dragToFolder } from './folderDrag'
import { tokenDrop } from './canvasState'
import { CharacterSheet } from './sheets'
import { showLink } from "./linkState";

/** Side by side or one at a time (ui/TwoPane.tsx); kept under the key it always had. */
export const charactersLayout = createPaneLayout('charsList', { list: 'list', detail: 'sheet' })

export function CharactersPanel({ campaign }: { campaign: Campaign }) {
  const system = systemOf(campaign)
  const characters = useY(campaign.characters, () => listCharacters(campaign))
  const folders = useY(campaign.characterFolders, () => listFolders(campaign))
  const selectedId = useY(campaign.members, () => selectedCharacterId(campaign))
  const isGm = useY(campaign.members, () => campaign.isGm())
  const creating = useSignal(false)
  // Copies (a template's tokens) aren't listed, but selecting one's token opens its sheet.
  const selected = useY(campaign.characters, () => getCharacter(campaign, selectedId))
  // One at a time: which level shows, the list or the sheet.
  const { level, go } = usePaneLevel(charactersLayout, selectedId ? 'detail' : 'list')
  const seen = useRef(selectedId)
  useEffect(() => {
    // The open character was deleted: back to the list, not on to another sheet.
    if (seen.current && seen.current !== selectedId && !campaign.characters.has(seen.current)) go('list')
    else if (seen.current !== selectedId && selectedId) go('detail')
    seen.current = selectedId
  }, [selectedId])

  return (
    <TwoPane
      layout={charactersLayout}
      level={level.value}
      title={creating.value ? 'New character' : (selected?.name ?? 'Characters')}
      backLabel="Back to the character list"
      onBack={() => go('list')}
      resizeLabel="Resize character list"
      list={
        <CharacterList
          campaign={campaign}
          system={system}
          characters={characters}
          folders={folders}
          selectedId={selectedId}
          onNew={() => {
            creating.value = true
            go('detail')
          }}
          onPick={(id) => {
            creating.value = false
            go('detail')
            selectCharacter(campaign, id)
          }}
        />
      }
      detail={
        <div class="chars-sheet panel-scroll sheet-panel">
          {creating.value ? (
            <NewCharacter campaign={campaign} system={system} folders={folders} isGm={isGm} onDone={() => (creating.value = false)} />
          ) : selected ? (
            <CharacterSheet campaign={campaign} system={system} c={selected} />
          ) : (
            <p class="empty">Create a character, or pick one to see its sheet.</p>
          )}
        </div>
      }
    />
  )
}

/** The left pane: characters, filed in folders. Drag a character onto a folder to file it. */
function CharacterList({
  campaign,
  system,
  characters,
  folders,
  selectedId,
  onNew,
  onPick,
}: {
  campaign: Campaign
  system: GameSystem
  characters: CharacterView[]
  folders: FolderView[]
  selectedId: string | undefined
  onNew: () => void
  onPick: (id: string) => void
}) {
  // Folders the user has folded away (this device only).
  const folded = useSignal<Set<string>>(new Set())
  // A folder being named: its id, or 'new'.
  const naming = useSignal<string | null>(null)
  const menu = useSignal<{ x: number; y: number; items: MenuItem[] } | null>(null)
  // A character waiting for its deletion to be confirmed.
  const deleting = useSignal<string | null>(null)
  const known = new Set(folders.map((f) => f.id))
  const inFolder = (id: string) => characters.filter((c) => c.folder === id)
  const loose = characters.filter((c) => !c.folder || !known.has(c.folder))

  const toggle = (id: string) => {
    const next = new Set(folded.value)
    if (!next.delete(id)) next.add(id)
    folded.value = next
  }

  const row = (c: CharacterView) => {
    const mine = canEdit(campaign, c)
    const trigger = menuTrigger((x, y) => {
      const items: MenuItem[] = []
      if (mine) {
        for (const f of folders) {
          if (f.id !== c.folder) items.push({ label: `Move to ${f.name}`, Icon: IconFolder, onSelect: () => moveToFolder(campaign, c.id, f.id) })
        }
        if (c.folder && known.has(c.folder)) items.push({ label: 'Remove from folder', onSelect: () => moveToFolder(campaign, c.id, undefined) })
        if (items.length) items.push('divider')
        items.push({ label: 'Delete character…', Icon: IconDelete, danger: true, onSelect: () => (deleting.value = c.id) })
      }
      if (items.length) menu.value = { x, y, items }
    })
    return (
      <ListRow
        key={c.id}
        lead={<Avatar id={c.id} name={c.name} />}
        name={c.name}
        tag={c.kind === "npc" ? "NPC" : null}
        selected={c.id === selectedId}
        onPick={() => onPick(c.id)}
        row={{
          "data-tip":
            c.kind === "npc"
              ? `${c.name} (NPC)`
              : `${c.name} (${system.classes.find((k) => k.id === c.classId)?.name ?? c.classId})`,
          "data-tip-side": true,
        }}
        pick={{
          onDblClick: (e) =>
            showLink({ kind: "character", id: c.id }, e.currentTarget),
          "data-kind": c.kind,
          "data-item-drop": mine ? c.id : undefined,
          "data-move-drop": mine ? c.id : undefined,
          onPointerDown: (e) => {
            trigger.onPointerDown(e);
            dragToFolder(
              e,
              mine ? (folder) => moveToFolder(campaign, c.id, folder) : null,
              (x, y) =>
                tokenDrop.value?.(x, y, {
                  characterId: c.id,
                  name: c.name,
                  image: c.portrait,
                  style: c.tokenStyle,
                  colour: c.tokenColour,
                }),
            );
          },
          onContextMenu: trigger.onContextMenu,
        }}
      />
    );
  }

  const folderMenu = (f: FolderView) =>
    menuTrigger((x, y) => {
      menu.value = {
        x,
        y,
        items: [
          { label: 'Rename folder', Icon: IconRename, onSelect: () => (naming.value = f.id) },
          { label: 'Delete folder', Icon: IconDelete, danger: true, onSelect: () => deleteFolder(campaign, f.id) },
        ],
      }
    })

  const doomed = deleting.value ? characters.find((c) => c.id === deleting.value) : undefined
  return (
    <nav class="chars-list" aria-label="Characters">
      {doomed && <DeleteCharacter campaign={campaign} c={doomed} onClose={() => (deleting.value = null)} />}
      <div class="chars-actions">
        <Button size="sm" onClick={onNew}>
          New
        </Button>
        <Button size="sm" variant="ghost" onClick={() => (naming.value = 'new')}>
          New folder
        </Button>
      </div>
      <div class="chars-tree panel-scroll" data-folder-drop="">
        {naming.value === 'new' && (
          <FolderName
            onDone={(name) => {
              if (name) createFolder(campaign, name)
              naming.value = null
            }}
          />
        )}
        {folders.map((f) => {
          const kids = inFolder(f.id)
          const open = !folded.value.has(f.id)
          const trigger = folderMenu(f)
          return (
            <ListGroup
              key={f.id}
              label={f.name}
              lead={<IconFolder size={16} />}
              count={kids.length}
              open={open}
              onToggle={() => toggle(f.id)}
              head={{ onPointerDown: trigger.onPointerDown, onContextMenu: trigger.onContextMenu }}
              group={{ 'data-folder-drop': f.id }}
              replaceHead={
                naming.value === f.id ? (
                  <FolderName
                    initial={f.name}
                    onDone={(name) => {
                      if (name) renameFolder(campaign, f.id, name)
                      naming.value = null
                    }}
                  />
                ) : undefined
              }
            >
              <List>{kids.map(row)}</List>
            </ListGroup>
          )
        })}
        <List>{loose.map(row)}</List>
        {!characters.length && !folders.length && <p class="empty-inline">No characters yet.</p>}
      </div>
      {menu.value && <ContextMenu {...menu.value} onClose={() => (menu.value = null)} />}
    </nav>
  )
}


function NewCharacter({
  campaign,
  system,
  folders,
  isGm,
  onDone,
}: {
  campaign: Campaign
  system: GameSystem
  folders: FolderView[]
  isGm: boolean
  onDone: () => void
}) {
  const kind = useSignal<'pc' | 'npc'>('pc')
  const name = useSignal('')
  const classId = useSignal(system.classes[0].id)
  const folder = useSignal('')
  // The guided flow: the system's choices at creation, then ability scores.
  const creation = system.creation
  const picks = useSignal<Record<string, Picked>>({})
  const method = useSignal<ScoreMethod>(creation ? scoreMethods(creation.scores)[0].id : 'manual')
  const scores = useSignal(creation ? startingScores(system, creation.scores, method.value) : {})
  const choices = choicesAt(creation, 'create', classId.value)
  const ready = kind.value === 'npc' || !creation || scoresReady(creation.scores, method.value, scores.value)
  const submit = () => {
    if (!ready) return
    if (kind.value === 'npc') newNpc(campaign, name.value, folder.value || undefined)
    else {
      const made = creation ? creationResult(system, classId.value, scores.value, picks.value) : undefined
      const id = newCharacter(campaign, name.value, classId.value, made)
      if (folder.value) moveToFolder(campaign, id, folder.value)
    }
    onDone()
  }
  const cls = system.classes.find((k) => k.id === classId.value)
  return (
    <form
      class="sheet-new"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      {isGm && (
        <div class="field">
          Type
          <Segmented
            label="Character type"
            value={kind.value}
            options={[
              { id: 'pc', label: 'Player character' },
              { id: 'npc', label: 'NPC' },
            ]}
            onChange={(v) => (kind.value = v)}
          />
        </div>
      )}
      <label class="field">
        Name
        <input class="input bevel" value={name.value} onInput={(e) => (name.value = e.currentTarget.value)} autofocus />
      </label>
      {kind.value === 'pc' && (
        <>
          <label class="field">
            Class
            <select class="input bevel" value={classId.value} onChange={(e) => (classId.value = e.currentTarget.value)}>
              {system.classes.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          </label>
          {cls && <p class="muted">{cls.blurb}</p>}
          {choices.map((ch) => (
            <ChoiceField
              key={ch.id}
              system={system}
              choice={ch}
              value={picks.value[ch.id] ?? emptyPick()}
              onChange={(p) => (picks.value = { ...picks.value, [ch.id]: p })}
            />
          ))}
          {creation && <ScoreFields system={system} methods={creation.scores} method={method} scores={scores} />}
        </>
      )}
      {folders.length > 0 && (
        <label class="field">
          Folder
          <select class="input bevel" value={folder.value} onChange={(e) => (folder.value = e.currentTarget.value)}>
            <option value="">None</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div class="sheet-row">
        <Button variant="primary" size="sm" type="submit" disabled={!ready}>
          Create
        </Button>
        <Button variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

/** Asks before deleting a character: it can't be undone. */
function DeleteCharacter({ campaign, c, onClose }: { campaign: Campaign; c: CharacterView; onClose: () => void }) {
  const ref = usePopupDialog();
  return (
    <Dialog dialogRef={ref} title="Delete character" onClose={onClose}>
      <p>
        Delete <strong>{c.name}</strong>? Their sheet is gone for everyone, and tokens on the map stop being linked to
        them. This can't be undone.
      </p>
      <div class="form-actions">
        <Button variant="ghost" onClick={() => ref.current?.close()}>
          Cancel
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            deleteCharacter(campaign, c.id)
            ref.current?.close()
          }}
        >
          Delete
        </Button>
      </div>
    </Dialog>
  )
}
