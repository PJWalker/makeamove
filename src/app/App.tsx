import { store } from "../lib/store";
import { lazy, Suspense, useEffect } from "react";
import { startChatNotifications } from "../features/chat/notify";
import { Lobby } from "../lobby/Lobby";
import { goToCampaign, routeCampaignId } from "../navigation/router";
import {
  activeCampaign,
  type Campaign,
  closeCampaign,
  deleteLocalCampaign,
  openCampaign,
} from "../campaign/campaign";
import { Button } from "../ui/Button";
import { Tooltip } from "../ui/Tooltip";
import { useValue } from "../ui/useValue";

// The table loads when a campaign opens, so the lobby comes up quickly.
const Tabletop = lazy(() => import("../table/Tabletop").then((m) => ({ default: m.Tabletop })));

const openError = store<string | null>(null);

export function App() {
  const id = useValue(routeCampaignId);

  useEffect(() => startChatNotifications(), []);

  useEffect(() => {
    if (!id) {
      closeCampaign();
      return;
    }
    openError.value = null;
    openCampaign(id).catch((e) => {
      openError.value = `Couldn't open that campaign: ${e}`;
      goToCampaign(null);
    });
  }, [id]);

  return (
    <>
      <Screen id={id} />
      <Tooltip />
    </>
  );
}

function Screen({ id }: { id: string | null }) {
  const campaign = useValue(activeCampaign);
  const removed = useValue(campaign?.removed);
  const ready = useValue(campaign?.ready);
  const error = useValue(openError);
  if (id && campaign?.id === id) {
    if (removed) return <Removed campaign={campaign} />;
    if (!ready) return <Waiting campaign={campaign} />;
    return (
      <Suspense fallback={<div className="loading">Opening campaign…</div>}>
        <Tabletop campaign={campaign} />
      </Suspense>
    );
  }
  if (id) return <div className="loading">Opening campaign…</div>;
  return <Lobby error={error} />;
}

/** Shown to a player the GM removed; their device has left the room. */
function Removed({ campaign }: { campaign: Campaign }) {
  return (
    <main className="loading waiting">
      <p>The GM removed you from {campaign.name}.</p>
      <p className="muted">If they let you back in, open their invite link again to rejoin.</p>
      <div className="form-actions">
        <Button
          variant="danger"
          className="form-actions-start"
          onClick={() => void deleteLocalCampaign(campaign.id).then(() => goToCampaign(null))}
        >
          Delete from This Device
        </Button>
        <Button variant="primary" onClick={() => goToCampaign(null)}>
          Back to the Lobby
        </Button>
      </div>
    </main>
  );
}

/** A joined campaign is empty until the first peer sends it over. */
function Waiting({ campaign }: { campaign: Campaign }) {
  const peers = useValue(campaign.peerCount);
  return (
    <main className="loading waiting">
      <p>Waiting for someone from this campaign to come online…</p>
      <p className="muted">{peers} connected</p>
      <Button onClick={() => goToCampaign(null)}>Back to the Lobby</Button>
    </main>
  );
}
