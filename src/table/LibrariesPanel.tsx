import { signal } from '@preact/signals'
import { addItem, baseSystemOf, canEdit, getCharacter, selectedCharacterId, startMove, systemOf } from '../characters/api'
import { KIND_LABEL, librariesFor, searchEntries, type EntryKind, type LibraryEntry } from '../library'
import type { Campaign } from '../store/campaign'
import { useY } from '../store/useY'
import { Button } from '../ui/Button'
import { Segmented } from '../ui/Segmented'
import { entryIcon } from '../ui/entryIcons'
import { List, ListGroup, Tag } from '../ui/List'
import { EntryRow, EntryWindow, rollTag, useEntryWindows } from './EntryWindow'
import { dragEntity, entity } from './entityDrag'
import { libraryView as view, type KindFilter } from './libraryView'
import { linkProxy } from './LinkChip'
import { makeVerb } from './sheetParts'

/** Collections folded away, by "source/collection" (this device only). */
const folded = signal<Set<string>>(new Set())

/**
 * The Libraries: everything the game system and plugins contribute (items,
 * moves, classes, tags), grouped by where it comes from. Gear can be added
 * to the selected character, and moves made by them.
 */
export function LibrariesPanel({ campaign }: { campaign: Campaign }) {
  const system = systemOf(campaign)
  // The Libraries are the system's own; homebrew is in the Items panel.
  const sources = librariesFor(baseSystemOf(campaign))
  const meId = useY(campaign.members, () => selectedCharacterId(campaign))
  const me = useY(campaign.characters, () => getCharacter(campaign, meId))
  const canAct = !!me && canEdit(campaign, me)
  const windows = useEntryWindows()
  const { kind, query } = view.value
  const searching = query.trim() !== ''

  const kinds = (Object.keys(KIND_LABEL) as EntryKind[]).filter((k) => sources.some((s) => s.collections.some((c) => c.kind === k)))
  const keyOf = (sourceId: string, e: LibraryEntry) => `lib:${sourceId}:${e.kind}:${e.id}`
  const toggle = (id: string) => {
    const next = new Set(folded.value)
    if (!next.delete(id)) next.add(id)
    folded.value = next
  }

  /** The buttons an entry offers, in its row or its window. */
  const actions = (e: LibraryEntry, inWindow = false) => {
    if (e.kind === 'item') {
      return (
        <Button
          size="sm"
          variant={inWindow ? 'primary' : 'secondary'}
          disabled={!canAct}
          title={canAct ? undefined : !me ? 'Choose a character first' : 'Not your character'}
          onClick={() => me && addItem(campaign, me.id, e.item)}
        >
          {inWindow && me ? `Give to ${me.name}` : 'Add'}
        </Button>
      )
    }
    if (e.kind === 'move' && inWindow) {
      const { label, Icon } = makeVerb(e.move)
      return (
        <Button variant="primary" disabled={!canAct} onClick={() => me && startMove(campaign, me.id, e.move)}>
          <Icon size={18} /> {label}
          {me ? ` as ${me.name}` : ''}
        </Button>
      )
    }
    return null
  }

  const tagOf = (e: LibraryEntry) => (e.kind === 'move' ? rollTag(system, e.move) : null)
  const metaOf = (e: LibraryEntry) =>
    e.kind === 'item' ? [e.item.weight ? `${e.item.weight} wt` : '', e.item.uses ? `${e.item.uses} ${e.item.uses === 1 ? 'use' : 'uses'}` : ''].filter(Boolean).join(' · ') : undefined

  const all = sources.flatMap((s) => s.collections.flatMap((c) => c.entries.map((e) => [s.id, e] as const)))

  return (
    <div class="panel-scroll libraries">
      <div class="libraries-tools">
        <input
          class="input bevel"
          type="search"
          placeholder="Search the Libraries…"
          aria-label="Search the Libraries"
          value={query}
          onInput={(e) => (view.value = { ...view.value, query: e.currentTarget.value })}
        />
        {kinds.length > 1 && (
          <Segmented
            label="Show"
            value={kind}
            options={[{ id: 'all' as KindFilter, label: 'All' }, ...kinds.map((k) => ({ id: k as KindFilter, label: KIND_LABEL[k] }))]}
            onChange={(k) => (view.value = { ...view.value, kind: k })}
          />
        )}
        <p class="muted libraries-target">
          {me ? (canAct ? `Adding to ${me.name}` : `${me.name} isn’t yours to change`) : 'Choose a character to add things to'}
        </p>
      </div>

      {sources.map((s) => {
        const collections = s.collections
          .filter((c) => kind === 'all' || c.kind === kind)
          .map((c) => ({ c, entries: searchEntries(c.entries, query) }))
          .filter(({ entries }) => entries.length > 0)
        if (!collections.length) return null
        return (
          <section key={s.id} class="library-source" aria-label={s.name}>
            <h3 class="eyebrow">{s.name}</h3>
            {collections.map(({ c, entries }) => {
              const id = `${s.id}/${c.id}`
              const open = searching || !folded.value.has(id)
              return (
                <ListGroup key={c.id} label={c.name} count={entries.length} open={open} onToggle={() => toggle(id)}>
                  <List>
                    {entries.map((e) => (
                      <EntryRow
                        key={e.id}
                        name={e.name}
                        Icon={entryIcon(e.kind, e.icon)}
                        tag={tagOf(e)}
                        meta={metaOf(e)}
                        tip={
                          e.kind === 'item'
                            ? `${e.text}\n\nDrag onto a character to give it to them, or into a note to link it.`
                            : e.kind === 'move'
                              ? `${e.text}\n\nDrag onto a character to teach it to them, or into a note to link it.`
                              : e.text
                        }
                        onOpen={(row) => windows.show(keyOf(s.id, e), row)}
                        onPointerDown={
                          e.kind === 'item' || e.kind === 'move'
                            ? (ev) => dragEntity(ev, entity(campaign, e.kind, e.id, e.name))
                            : undefined
                        }
                      >
                        {actions(e)}
                      </EntryRow>
                    ))}
                  </List>
                </ListGroup>
              )
            })}
            {s.attribution && <p class="muted sheet-attribution">{s.attribution}</p>}
          </section>
        )
      })}
      {searching && !all.some(([, e]) => (kind === 'all' || e.kind === kind) && searchEntries([e], query).length) && (
        <p class="empty">Nothing matches “{query.trim()}”.</p>
      )}

      {windows.keys.map((key) => {
        const found = all.find(([sid, e]) => keyOf(sid, e) === key)
        if (!found) return null
        const e = found[1]
        const tag = tagOf(e)
        return (
          <EntryWindow
            key={key}
            entryKey={key}
            title={e.name}
            text={e.text}
            tags={e.tags}
            onClose={() => windows.close(key)}
            proxy={e.kind === 'item' || e.kind === 'move' ? linkProxy(campaign, e.kind, e.id, e.name, e.icon) : undefined}
          >
            {tag && <Tag>{tag}</Tag>}
            {metaOf(e) && <span class="muted">{metaOf(e)}</span>}
            {actions(e, true)}
          </EntryWindow>
        )
      })}
    </div>
  )
}
