import { IconCharacters, IconChat, IconDice, IconItems, IconMembers, IconNotes } from '../ui/icons'
import type { ComponentType } from 'preact'
import type { Campaign } from '../store/campaign'
import { device } from '../store/device'
import { useY } from '../store/useY'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import type { PanelId } from './panelLayout'

export const PANELS: Record<PanelId, { label: string; Icon: ComponentType<any> }> = {
  chat: { label: 'Chat', Icon: IconChat },
  characters: { label: 'Characters', Icon: IconCharacters },
  items: { label: 'Items', Icon: IconItems },
  notes: { label: 'Notes', Icon: IconNotes },
  members: { label: 'Members', Icon: IconMembers },
}

const COMING: Partial<Record<PanelId, string>> = {
  characters: 'Dungeon World character sheets arrive in M4.',
  items: 'Items, tags and the compendium arrive in M4.',
  notes: 'Session and world notes arrive in M5.',
}

/** The body of a panel; the same component renders docked or floating. */
export function PanelContent({ id, campaign }: { id: PanelId; campaign: Campaign }) {
  if (id === 'chat') return <ChatPanel campaign={campaign} />
  if (id === 'members') return <MemberList campaign={campaign} />
  const { Icon } = PANELS[id]
  return (
    <div class="panel-scroll">
      <div class="empty">
        <Icon size={28} />
        {COMING[id]}
      </div>
    </div>
  )
}

function ChatPanel({ campaign }: { campaign: Campaign }) {
  return (
    <div class="chat">
      <ChatPresence campaign={campaign} />
      <div class="panel-scroll">
        <div class="empty">
          <IconChat size={28} />
          Chat and the running move log arrive in M3.
        </div>
      </div>
      <DiceTray />
    </div>
  )
}

/**
 * Who's at the table. Until peer-to-peer sync lands in M2, only this device
 * counts as online.
 */
function ChatPresence({ campaign }: { campaign: Campaign }) {
  const members = useY(campaign.members, () => campaign.memberViews())
  const me = device.value.id
  const sorted = [...members].sort((a, b) => Number(b.id === me) - Number(a.id === me))
  return (
    <div class="chat-presence">
      <ul class="avatar-stack" aria-label="People in this campaign">
        {sorted.map((m) => (
          <li key={m.id}>
            <Avatar id={m.id} name={m.name} online={m.id === me} />
          </li>
        ))}
      </ul>
      <span class="status" title="Peer-to-peer sync arrives in M2">
        <span class="status-dot" aria-hidden="true" /> Local only
      </span>
    </div>
  )
}

const DICE = [4, 6, 8, 10, 12, 20]

/** Quick-dice bar at the foot of the chat; rolling arrives in M3. */
function DiceTray() {
  return (
    <div class="dice-tray" aria-label="Dice">
      <div class="dice-quick">
        {DICE.map((sides) => (
          <Button key={sides} variant="ghost" size="sm" disabled label="Dice rolling arrives in M3">
            d{sides}
          </Button>
        ))}
      </div>
      <div class="dice-entry">
        <input class="input bevel dice-formula" placeholder="2d6+1" aria-label="Dice formula" disabled />
        <Button variant="primary" size="sm" disabled label="Dice rolling arrives in M3">
          <IconDice size={15} /> Roll
        </Button>
      </div>
    </div>
  )
}

function MemberList({ campaign }: { campaign: Campaign }) {
  const members = useY(campaign.members, () => campaign.memberViews())
  return (
    <div class="panel-scroll">
      <ul class="member-list">
        {members.map((m) => (
          <li key={m.id} class="member">
            <Avatar id={m.id} name={m.name} />
            <span class="member-name">
              {m.name}
              {m.id === device.value.id && <span class="muted"> (you)</span>}
            </span>
            <span class="role-badge bevel" data-role={m.role}>
              {m.role === 'gm' ? 'GM' : m.role === 'observer' ? 'Observer' : 'Player'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
