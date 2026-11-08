import { lazy, Suspense, useState } from "react";
import { IconAllowBack, IconRemoveMember } from "../ui/icons";
import type { Campaign, MemberView } from "../campaign/campaign";
import { device } from "../platform/device";
import { useY } from "../ui/useY";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import type { PanelId } from "../workspace/panelLayout";
import { charactersLayout, notesLayout, scenesLayout } from "./panelLayouts";
import { useValue } from "../ui/useValue";

const ScenePanel = lazy(() =>
  import("./ScenePanel").then((module) => ({ default: module.ScenePanel })),
);
const ChatPanel = lazy(() =>
  import("./ChatPanel").then((module) => ({ default: module.ChatPanel })),
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

/** The body of a panel; the same component renders docked or floating. */
export function PanelContent({ id, campaign }: { id: PanelId; campaign: Campaign }) {
  return (
    <Suspense
      fallback={
        <div className="panel-loading" role="status">
          Loading…
        </div>
      }
    >
      {id === "scene" ? (
        <ScenePanel campaign={campaign} />
      ) : id === "chat" ? (
        <ChatPanel campaign={campaign} />
      ) : id === "characters" ? (
        <CharactersPanel campaign={campaign} />
      ) : id === "libraries" ? (
        <LibrariesPanel campaign={campaign} />
      ) : id === "reference" ? (
        <ReferencePanel campaign={campaign} />
      ) : id === "notes" ? (
        <NotesPanel campaign={campaign} />
      ) : id === "combat" ? (
        <CombatPanel campaign={campaign} />
      ) : id === "items" ? (
        <ItemsPanel campaign={campaign} />
      ) : (
        <MemberList campaign={campaign} />
      )}
    </Suspense>
  );
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
  const members = useY(campaign.members, () => campaign.memberViews());
  const me = useValue(device).id;
  const online = useValue(campaign.online);
  const peers = useValue(campaign.peerCount);
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
  const members = useY(campaign.members, () => campaign.memberViews());
  const revoked = useY(campaign.revoked, () => campaign.revokedViews());
  const isGm = useY(campaign.members, () => campaign.isGm());
  const me = useValue(device).id;
  return (
    <div className="panel-scroll">
      <Presence campaign={campaign} />
      <ul className="member-list">
        {members.map((m) => (
          <MemberRow
            key={m.id}
            campaign={campaign}
            m={m}
            canRemove={isGm && m.id !== me && m.role !== "gm"}
          />
        ))}
      </ul>
      {isGm && revoked.length > 0 && (
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
function MemberRow({
  campaign,
  m,
  canRemove,
}: {
  campaign: Campaign;
  m: MemberView;
  canRemove: boolean;
}) {
  const me = useValue(device).id;
  const online = useValue(campaign.online);
  const [confirming, setConfirming] = useState(false);
  if (confirming) {
    return (
      <li className="member member-confirm">
        <span className="member-name">Remove {m.name} from the campaign?</span>
        <Button variant="ghost" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
        <Button variant="danger" onClick={() => campaign.revokeMember(m.id)}>
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
