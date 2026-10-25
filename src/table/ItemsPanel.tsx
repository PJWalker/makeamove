import { useSignal } from '@preact/signals'
import {
  addItem,
  canEdit,
  getCharacter,
  removeItem,
  selectedCharacterId,
  systemOf,
  updateItem,
} from '../characters/api'
import { derive, type ItemInstance } from '../characters/store'
import type { Campaign } from '../store/campaign'
import { useY } from '../store/useY'
import type { GameSystem } from '../systems/types'
import { Button } from '../ui/Button'

/** The selected character's gear, and the compendium to add more from. */
export function ItemsPanel({ campaign }: { campaign: Campaign }) {
  const system = systemOf(campaign)
  const id = useY(campaign.members, () => selectedCharacterId(campaign))
  const c = useY(campaign.characters, () => getCharacter(campaign, id))
  const query = useSignal('')
  const tab = useSignal<'gear' | 'compendium'>('gear')

  if (!c) {
    return (
      <div class="panel-scroll">
        <p class="empty">Choose a character in the Characters panel to manage their gear.</p>
      </div>
    )
  }
  const editable = canEdit(campaign, c)
  const d = derive(c, system)

  return (
    <div class="panel-scroll sheet-panel">
      <div class="sheet-picker">
        <Button size="sm" pressed={tab.value === 'gear'} onClick={() => (tab.value = 'gear')}>
          {c.name}’s gear
        </Button>
        <Button size="sm" pressed={tab.value === 'compendium'} onClick={() => (tab.value = 'compendium')}>
          Compendium
        </Button>
      </div>
      {tab.value === 'gear' ? (
        <>
          <p class="muted" data-over={d.load > d.maxLoad}>
            Load {d.load}/{d.maxLoad}
            {d.load > d.maxLoad && ' (overloaded)'}
          </p>
          {c.inventory.length === 0 && <p class="empty">Nothing carried. Add something from the compendium.</p>}
          <ul class="item-list">
            {c.inventory.map((i) => (
              <ItemRow key={i.id} campaign={campaign} characterId={c.id} item={i} editable={editable} />
            ))}
          </ul>
        </>
      ) : (
        <Compendium
          system={system}
          query={query.value}
          onQuery={(q) => (query.value = q)}
          canAdd={editable}
          onAdd={(def) => addItem(campaign, c.id, def)}
        />
      )}
    </div>
  )
}

function ItemRow({
  campaign,
  characterId,
  item,
  editable,
}: {
  campaign: Campaign
  characterId: string
  item: ItemInstance
  editable: boolean
}) {
  const patch = (p: Partial<ItemInstance>) => updateItem(campaign, characterId, item.id, p)
  return (
    <li class="item-row" data-equipped={item.equipped}>
      <details>
        <summary>
          <span class="move-name">{item.name}</span>
          <span class="muted item-meta">
            {item.weight ? `${item.weight} wt` : 'no weight'}
            {item.uses ? ` · ${item.usesLeft}/${item.uses} uses` : ''}
          </span>
        </summary>
        <p class="move-text">{item.description}</p>
        {item.tags.length > 0 && <p class="muted item-tags">{item.tags.join(', ')}</p>}
      </details>
      <div class="item-actions">
        {item.equippable && (
          <Button size="sm" pressed={item.equipped} disabled={!editable} onClick={() => patch({ equipped: !item.equipped })}>
            {item.equipped ? 'Equipped' : 'Equip'}
          </Button>
        )}
        {item.uses !== undefined && (
          <Button
            size="sm"
            disabled={!editable || !item.usesLeft}
            onClick={() => patch({ usesLeft: Math.max(0, (item.usesLeft ?? 0) - 1) })}
          >
            Use
          </Button>
        )}
        <Button
          variant="icon"
          size="sm"
          label={`Remove ${item.name}`}
          disabled={!editable}
          onClick={() => removeItem(campaign, characterId, item.id)}
        >
          ×
        </Button>
      </div>
    </li>
  )
}

function Compendium({
  system,
  query,
  onQuery,
  canAdd,
  onAdd,
}: {
  system: GameSystem
  query: string
  onQuery: (q: string) => void
  canAdd: boolean
  onAdd: (def: GameSystem['items'][number]) => void
}) {
  const q = query.trim().toLowerCase()
  const items = system.items.filter(
    (i) => !q || i.name.toLowerCase().includes(q) || i.tags.some((t) => t.toLowerCase().includes(q)),
  )
  return (
    <>
      <input
        class="input bevel"
        type="search"
        placeholder="Search items…"
        aria-label="Search items"
        value={query}
        onInput={(e) => onQuery(e.currentTarget.value)}
      />
      <ul class="item-list">
        {items.map((i) => (
          <li key={i.id} class="item-row">
            <details>
              <summary>
                <span class="move-name">{i.name}</span>
                <span class="muted item-meta">{i.weight ? `${i.weight} wt` : 'no weight'}</span>
              </summary>
              <p class="move-text">{i.description}</p>
              {i.tags.length > 0 && <p class="muted item-tags">{i.tags.join(', ')}</p>}
            </details>
            <Button size="sm" disabled={!canAdd} onClick={() => onAdd(i)}>
              Add
            </Button>
          </li>
        ))}
      </ul>
      <p class="muted sheet-attribution">{system.attribution}</p>
    </>
  )
}
