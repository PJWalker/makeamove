import { useSignal } from '@preact/signals'
import {
  IconAllowBack,
  IconCharacters,
  IconChat,
  IconCombat,
  IconItems,
  IconLibraries,
  IconMembers,
  IconNotes,
  IconRemoveMember,
  IconMap,
} from '../ui/icons'
import type { ComponentType } from 'preact'
import type { Campaign, MemberView } from '../store/campaign'
import { device } from '../store/device'
import { useY } from '../store/useY'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import type { PanelId } from './panelLayout'
import { ChatPanel } from './ChatPanel'
import { CharactersPanel, charactersLayout } from './CharactersPanel'
import { LibrariesPanel } from './LibrariesPanel'
import { NotesPanel, notesLayout } from './NotesPanel'
import { ScenePanel, scenesLayout } from "./ScenePanel";
import { CombatPanel } from './CombatPanel'
import { ItemsPanel } from './ItemsPanel'

export const PANELS: Record<PanelId, { label: string; Icon: ComponentType<any> }> = {
  scene: { label: 'Scenes', Icon: IconMap },
  chat: { label: 'Chat', Icon: IconChat },
  characters: { label: 'Characters', Icon: IconCharacters },
  combat: { label: 'Combat', Icon: IconCombat },
  libraries: { label: 'Libraries', Icon: IconLibraries },
  items: { label: 'Items', Icon: IconItems },
  notes: { label: 'Notes', Icon: IconNotes },
  members: { label: 'Members', Icon: IconMembers },
}

/** The body of a panel; the same component renders docked or floating. */
export function PanelContent({ id, campaign }: { id: PanelId; campaign: Campaign }) {
  if (id === 'scene') return <ScenePanel campaign={campaign} />
  if (id === 'chat') return <Chat campaign={campaign} />
  if (id === 'characters') return <CharactersPanel campaign={campaign} />
  if (id === 'libraries') return <LibrariesPanel campaign={campaign} />
  if (id === 'notes') return <NotesPanel campaign={campaign} />
  if (id === 'combat') return <CombatPanel campaign={campaign} />
  if (id === 'items') return <ItemsPanel campaign={campaign} />
  return <MemberList campaign={campaign} />
}

/** Panels that are a list and a detail have a layout switch in their title bar. */
export function PaneToggle({ id }: { id: PanelId }) {
  if (id === 'characters') return <charactersLayout.Toggle />
  if (id === 'notes') return <notesLayout.Toggle />
  if (id === "scene") return <scenesLayout.Toggle />;
  return null
}

function Chat({ campaign }: { campaign: Campaign }) {
  return <ChatPanel campaign={campaign} />
}

/** Who's at the table, and who's online right now. */
function Presence({ campaign }: { campaign: Campaign }) {
  const members = useY(campaign.members, () => campaign.memberViews())
  const me = device.value.id
  const online = campaign.online.value
  const peers = campaign.peerCount.value
  const sorted = [...members].sort((a, b) => Number(b.id === me) - Number(a.id === me))
  return (
    <div class="chat-presence">
      <ul class="avatar-stack" aria-label="People in this campaign">
        {sorted.map((m) => (
          <li key={m.id}>
            <Avatar id={m.id} name={m.name} online={m.id === me || online.has(m.id)} />
          </li>
        ))}
      </ul>
      <span class="status" title={peers ? 'Syncing directly with other players' : 'Waiting for other players'}>
        <span class="status-dot" aria-hidden="true" data-on={peers > 0} />{' '}
        {peers ? `${peers} connected` : 'Local only'}
      </span>
    </div>
  )
}

function MemberList({ campaign }: { campaign: Campaign }) {
  const members = useY(campaign.members, () => campaign.memberViews())
  const revoked = useY(campaign.revoked, () => campaign.revokedViews())
  const isGm = useY(campaign.members, () => campaign.isGm())
  return (
    <div class="panel-scroll">
      <Presence campaign={campaign} />
      <ul class="member-list">
        {members.map((m) => (
          <MemberRow
            key={m.id}
            campaign={campaign}
            m={m}
            canRemove={isGm && m.id !== device.value.id && m.role !== "gm"}
          />
        ))}
      </ul>
      {isGm && revoked.length > 0 && (
        <section class="member-section" aria-labelledby="removed-members">
          <h3 id="removed-members" class="eyebrow">
            Removed
          </h3>
          <ul class="member-list">
            {revoked.map((r) => (
              <li key={r.id} class="member" data-removed="true">
                <Avatar id={r.id} name={r.name} online={false} />
                <span class="member-name">{r.name}</span>
                <Button
                  variant="icon"
                  label={`Let ${r.name} back in (they rejoin with the invite link)`}
                  onClick={() => campaign.allowBack(r.id)}
                >
                  <IconAllowBack size={22} />
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** One member, with the GM's remove control and its confirmation. */
function MemberRow({ campaign, m, canRemove }: { campaign: Campaign; m: MemberView; canRemove: boolean }) {
  const confirming = useSignal(false)
  if (confirming.value) {
    return (
      <li class="member member-confirm">
        <span class="member-name">Remove {m.name} from the campaign?</span>
        <Button variant="danger" size="sm" onClick={() => campaign.revokeMember(m.id)}>
          Remove
        </Button>
        <Button variant="ghost" size="sm" onClick={() => (confirming.value = false)}>
          Cancel
        </Button>
      </li>
    )
  }
  return (
    <li class="member">
      <Avatar
        id={m.id}
        name={m.name}
        online={m.id === device.value.id || campaign.online.value.has(m.id)}
      />
      <span class="member-name">
        {m.name}
        {m.id === device.value.id && <span class="muted"> (you)</span>}
      </span>
      <span class="role-badge bevel" data-role={m.role}>
        {m.role === "gm" ? "GM" : m.role === "observer" ? "Observer" : "Player"}
      </span>
      {canRemove && (
        <Button
          variant="icon"
          label={`Remove ${m.name}`}
          onClick={() => (confirming.value = true)}
        >
          <IconRemoveMember size={22} />
        </Button>
      )}
    </li>
  );
}
