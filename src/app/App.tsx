import { store } from "../lib/store";
import { lazy, Suspense, useEffect, useState } from "react";
import { Lobby } from "../lobby/Lobby";
import { goToCampaign, routeCampaignId } from "../navigation/router";
import { type Campaign, deleteLocalCampaign, openCampaign } from "../campaign/campaign";
import { tableCommands } from "../workspace/commands/all";
import { extensionOf } from "../systems/extensions";
import { CampaignContext, CampaignReactContext } from "../workspace/campaignContext";
import { Button } from "../ui/Button";
import { PeerBlobsContext } from "../ui/blobImageContext";
import { Tooltip } from "../ui/Tooltip";
import { withTransition } from "../ui/transition";
import { useQuery } from "../ui/useQuery";

// The table loads when a campaign opens, so the lobby comes up quickly.
const Tabletop = lazy(() => import("../table/Tabletop").then((m) => ({ default: m.Tabletop })));

const openError = store<string | null>(null);

/** The campaign the route names, open for as long as the route names it. */
function useOpenCampaign(id: string | null): CampaignContext | null {
  const [open, setOpen] = useState<CampaignContext | null>(null);
  useEffect(() => {
    if (!id) return;
    openError.value = null;
    let ctx: CampaignContext | null = null;
    let left = false;
    openCampaign(id)
      .then((campaign) =>
        CampaignContext.open(campaign, () => [
          ...tableCommands,
          ...(extensionOf(campaign.systemId).commands ?? []),
        ]),
      )
      .then((c) => {
        if (left) return c.dispose();
        ctx = c;
        setOpen(c);
      })
      .catch((e) => {
        if (left) return;
        openError.value = `Couldn't open that campaign: ${e}`;
        goToCampaign(null);
      });
    return () => {
      left = true;
      ctx?.dispose();
    };
  }, [id]);
  return open && !open.disposed && open.campaign.id === id ? open : null;
}

export function App() {
  const id = useQuery(routeCampaignId);
  const ctx = useOpenCampaign(id);
  return (
    <>
      <Screen id={id} ctx={ctx} />
      <Tooltip />
    </>
  );
}

function Screen({ id, ctx }: { id: string | null; ctx: CampaignContext | null }) {
  const campaign = ctx?.campaign;
  const removed = useQuery(campaign?.removed);
  const ready = useQuery(campaign?.ready);
  const error = useQuery(openError);
  if (ctx && campaign) {
    if (removed) return <Removed campaign={campaign} />;
    if (!ready) return <Waiting campaign={campaign} />;
    return (
      <CampaignReactContext value={ctx}>
        <PeerBlobsContext value={ctx.blobs}>
          <Suspense fallback={<div className="loading">Opening campaign…</div>}>
            <Tabletop campaign={campaign} />
          </Suspense>
        </PeerBlobsContext>
      </CampaignReactContext>
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

/** How long a joined campaign waits for a peer before saying none has it. */
const WAIT_TIMEOUT_MS = 20_000;

/**
 * A joined campaign is empty until the first peer sends it over. It keeps
 * waiting after the timeout; the message changes so a stale invite doesn't
 * look like it's still loading.
 */
function Waiting({ campaign }: { campaign: Campaign }) {
  const peers = useQuery(campaign.peerCount);
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => void withTransition(() => setTimedOut(true)), WAIT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <main className="loading waiting">
      {timedOut ? (
        <>
          <p>No one online has this campaign.</p>
          <p className="muted">
            The invite may be out of date, or everyone who has the campaign is offline. It opens as
            soon as one of them comes online.
          </p>
        </>
      ) : (
        <p>Waiting for someone from this campaign to come online…</p>
      )}
      <p className="muted">{peers} connected</p>
      <div className="form-actions">
        {timedOut && (
          <Button
            variant="danger"
            className="form-actions-start"
            onClick={() => void deleteLocalCampaign(campaign.id).then(() => goToCampaign(null))}
          >
            Delete from This Device
          </Button>
        )}
        <Button variant={timedOut ? "primary" : "secondary"} onClick={() => goToCampaign(null)}>
          Back to the Lobby
        </Button>
      </div>
    </main>
  );
}
