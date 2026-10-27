import { removeItem, updateItem } from '../characters/api'
import type { CharacterView, ItemInstance } from '../characters/store'
import type { Derived } from '../systems/types'
import type { Campaign } from '../store/campaign'
import { Button } from '../ui/Button'
import { entryIcon } from '../ui/entryIcons'
import { IconClose } from '../ui/icons'
import { List } from '../ui/List'
import { EntryRow, EntryWindow, useEntryWindows } from './EntryWindow'
import { linkProxy } from './LinkChip'
import { browseLibrary } from './libraryView'

const metaOf = (i: ItemInstance) =>
  [i.weight ? `${i.weight} wt` : '', i.uses !== undefined ? `${i.usesLeft ?? 0}/${i.uses} uses` : ''].filter(Boolean).join(' · ')

const tipOf = (i: { description: string; tags: string[] }) => (i.tags.length ? `${i.description}\n\n${i.tags.join(', ')}` : i.description)

/**
 * A character's inventory, as a section of their sheet: what they carry and
 * the load it comes to. New things come from the Libraries.
 */
export function Inventory({
  campaign,
  c,
  d,
  editable,
}: {
  campaign: Campaign
  c: CharacterView
  /** Load figures, for characters whose system tracks load. */
  d?: Derived
  editable: boolean
}) {
  const windows = useEntryWindows()
  const patch = (i: ItemInstance, p: Partial<ItemInstance>) => updateItem(campaign, c.id, i.id, p)
  const over = d && d.values.load > d.values.maxLoad

  const actions = (i: ItemInstance) => (
    <>
      {i.equippable && (
        <Button size="sm" pressed={i.equipped} disabled={!editable} onClick={() => patch(i, { equipped: !i.equipped })}>
          {i.equipped ? 'Equipped' : 'Equip'}
        </Button>
      )}
      {i.uses !== undefined && (
        <Button size="sm" disabled={!editable || !i.usesLeft} onClick={() => patch(i, { usesLeft: Math.max(0, (i.usesLeft ?? 0) - 1) })}>
          Use
        </Button>
      )}
    </>
  )

  return (
    <section class="sheet-section inventory" aria-label="Inventory" data-item-drop={editable ? c.id : undefined}>
      <h3 class="sheet-heading">
        Inventory{' '}
        {d && (
          <span class="muted" data-over={over}>
            Load {d.values.load}/{d.values.maxLoad}
            {over && ' · overloaded'}
          </span>
        )}
      </h3>
      {c.inventory.length === 0 ? (
        <p class="muted">Nothing carried yet.{editable && ' Drag items here from the Libraries.'}</p>
      ) : (
        <List>
          {c.inventory.map((i) => (
            <EntryRow
              key={i.id}
              name={i.name}
              Icon={entryIcon('item', i.icon)}
              meta={metaOf(i)}
              tip={tipOf(i)}
              dim={i.equippable && !i.equipped}
              onOpen={(row) => windows.show(`item:${i.id}`, row)}
            >
              {actions(i)}
              <Button variant="icon" size="sm" label={`Remove ${i.name}`} disabled={!editable} onClick={() => removeItem(campaign, c.id, i.id)}>
                <IconClose size={14} />
              </Button>
            </EntryRow>
          ))}
        </List>
      )}
      {editable && (
        <Button size="sm" variant="ghost" class="inventory-find" onClick={() => browseLibrary('item')}>
          Find items in the Libraries…
        </Button>
      )}
      {windows.keys.map((key) => {
        const i = c.inventory.find((k) => `item:${k.id}` === key)
        if (!i) return null
        return (
          <EntryWindow
            key={key}
            entryKey={key}
            title={i.name}
            text={i.description}
            tags={i.tags}
            onClose={() => windows.close(key)}
            // Gear from the Libraries stands for its entry there.
            proxy={i.defId ? linkProxy(campaign, 'item', i.defId, i.name, i.icon) : undefined}
          >
            {metaOf(i) && <span class="muted">{metaOf(i)}</span>}
            {actions(i)}
          </EntryWindow>
        )
      })}
    </section>
  )
}
