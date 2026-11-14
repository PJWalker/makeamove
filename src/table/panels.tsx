import { lazy, Suspense, useState, type ComponentType } from "react";
import { IconAllowBack, IconRemoveMember } from "../ui/icons";
import type { Campaign, MemberView } from "../campaign/campaign";
import { device } from "../platform/device";
import { useQuery } from "../ui/useQuery";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { PANELS, type PanelId } from "../workspace/panelLayout";
import { playedCharacterId } from "../features/characters/api";
import { CampaignEntityGraphic } from "../workspace/EntityGraphic";
import { charactersLayout, notesLayout, scenesLayout } from "./panelLayouts";
import { allowBack, removeMember } from "../workspace/commands/campaign";
import { can } from "../workspace/commands/views";
import { useCampaign } from "../workspace/campaignContext";

const ScenePanel = lazy(() =>
  import("./ScenePanel").then((module) => ({ default: module.ScenePanel })),
);
const ChatPanel = lazy(() =>
  import("./ChatPanel").then((module) => ({ default: module.ChatPanel })),
);
const PlayerCharacterPanel = lazy(() =>
  import("./PlayerCharacterPanel").then((module) => ({
    default: module.PlayerCharacterPanel,
  })),
);
const CharactersPanel = lazy(() =>
  import("./CharactersPanel").then((module) => ({
    default: module.CharactersPanel,
  })),
);
const LibrariesPanel = lazy(() =>
  import("./LibrariesPanel").then((module) => ({
    default: module.LibrariesPanel,
  })),
);
const ReferencePanel = lazy(() =>
  import("./ReferencePanel").then((module) => ({
    default: module.ReferencePanel,
  })),
);
const NotesPanel = lazy(() =>
  import("./NotesPanel").then((module) => ({ default: module.NotesPanel })),
);
const CombatPanel = lazy(() =>
  import("./CombatPanel").then((module) => ({ default: module.CombatPanel })),
);
const ItemsPanel = lazy(() =>
  import("./ItemsPanel").then((module) => ({ default: module.ItemsPanel })),
);

const PANEL_COMPONENTS: Record<PanelId, ComponentType<{ campaign: Campaign }>> = {
  scene: ScenePanel,
  chat: ChatPanel,
  pc: PlayerCharacterPanel,
  characters: CharactersPanel,
  libraries: LibrariesPanel,
  reference: ReferencePanel,
  notes: NotesPanel,
  combat: CombatPanel,
  items: ItemsPanel,
  members: MemberList,
};

/** The body of a panel; the same component renders docked or floating. */
export function PanelContent({ id, campaign }: { id: PanelId; campaign: Campaign }) {
  const Panel = PANEL_COMPONENTS[id];
  return (
    <Suspense fallback={<output className="panel-loading">Loading…</output>}>
      <Panel campaign={campaign} />
    </Suspense>
  );
}

/** A panel's icon: My Character shows the character's graphic. */
export function PanelIcon({
  id,
  campaign,
  className,
}: {
  id: PanelId;
  campaign: Campaign;
  className?: string;
}) {
  const played = useQuery(campaign.members, () =>
    id === "pc" ? playedCharacterId(campaign) : undefined,
  );
  if (played)
    return (
      <CampaignEntityGraphic
        campaign={campaign}
        kind="character"
        id={played}
        size={22}
        className={className}
      />
    );
  const { Icon } = PANELS[id];
  return <Icon size={22} {...(className ? { className } : {})} />;
}

/** Panels that are a list and a detail have a layout switch in their title bar. */
export function PaneToggle({ id }: { id: PanelId }) {
  if (id === "characters") return <charactersLayout.Toggle />;
  if (id === "notes") return <notesLayout.Toggle />;
  if (id === "scene") return <scenesLayout.Toggle />;
  return null;
}

/** Who's at the table, and who's online right now. */
function Presence({ campaign }: { campaign: Campaign }) {
  const members = useQuery(campaign.members, () => campaign.memberViews());
  const me = useQuery(device).id;
  const online = useQuery(campaign.online);
  const peers = useQuery(campaign.peerCount);
  const sorted = [...members].sort((a, b) => Number(b.id === me) - Number(a.id === me));
  return (
    <div className="chat-presence">
      <ul className="avatar-stack" aria-label="People in this campaign">
        {sorted.map((m) => (
          <li key={m.id}>
            <Avatar id={m.id} name={m.name} online={m.id === me || online.has(m.id)} />
          </li>
        ))}
      </ul>
      <span
        className="status"
        title={peers ? "Syncing directly with other players" : "Waiting for other players"}
      >
        <span className="status-dot" aria-hidden="true" data-on={peers > 0} />{" "}
        {peers ? `${peers} connected` : "Local only"}
      </span>
    </div>
  );
}

function MemberList({ campaign }: { campaign: Campaign }) {
  const ctx = useCampaign();
  const members = useQuery(campaign.members, () => campaign.memberViews());
  const revoked = useQuery(campaign.revoked, () => campaign.revokedViews());
  // Re-read as roles change.
  useQuery(campaign.members, () => campaign.isGm());
  return (
    <div className="panel-scroll">
      <Presence campaign={campaign} />
      <ul className="member-list">
        {members.map((m) => (
          <MemberRow
            key={m.id}
            campaign={campaign}
            m={m}
            canRemove={can(ctx, removeMember, { id: m.id })}
          />
        ))}
      </ul>
      {revoked.length > 0 && can(ctx, allowBack, { id: revoked[0]!.id }) && (
        <section className="member-section" aria-labelledby="removed-members">
          <h3 id="removed-members" className="eyebrow">
            Removed
          </h3>
          <ul className="member-list">
            {revoked.map((r) => (
              <li key={r.id} className="member" data-removed="true">
                <Avatar id={r.id} name={r.name} online={false} />
                <span className="member-name">{r.name}</span>
                <Button
                  variant="icon"
                  label={`Let ${r.name} back in (they rejoin with the invite link)`}
                  onClick={() => ctx.execute(allowBack, { id: r.id })}
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
function MemberRow({
  campaign,
  m,
  canRemove,
}: {
  campaign: Campaign;
  m: MemberView;
  canRemove: boolean;
}) {
  const ctx = useCampaign();
  const me = useQuery(device).id;
  const online = useQuery(campaign.online);
  const [confirming, setConfirming] = useState(false);
  if (confirming) {
    return (
      <li className="member member-confirm">
        <span className="member-name">Remove {m.name} from the campaign?</span>
        <Button variant="ghost" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
        <Button variant="danger" onClick={() => ctx.execute(removeMember, { id: m.id })}>
          Remove
        </Button>
      </li>
    );
  }
  return (
    <li className="member">
      <Avatar id={m.id} name={m.name} online={m.id === me || online.has(m.id)} />
      <span className="member-name">
        {m.name}
        {m.id === me && <span className="muted"> (you)</span>}
      </span>
      <span className="role-badge" data-role={m.role}>
        {m.role === "gm" ? "GM" : m.role === "observer" ? "Observer" : "Player"}
      </span>
      {canRemove && (
        <Button variant="icon" label={`Remove ${m.name}`} onClick={() => setConfirming(true)}>
          <IconRemoveMember size={22} />
        </Button>
      )}
    </li>
  );
}
