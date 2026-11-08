import type { FormEvent } from "react";
import type { ComponentType } from "react";
import { useEffect, useRef, useState } from "react";
import { IconAdd, IconCampaign, IconDelete } from "../ui/icons";
import { goToCampaign, pendingInvite } from "../app/router";
import { createCampaign, deleteLocalCampaign, joinCampaign } from "../campaign/campaign";
import { device, setDeviceName } from "../platform/device";
import { campaigns, registryReady, type CampaignSummary } from "../campaign/registry";
import { getSystem, listSystems, NO_SYSTEM_ID } from "../systems";
import { Button } from "../ui/Button";
import { ContextMenu } from "../table/ContextMenu";
import { menuTrigger } from "../ui/menuTrigger";
import { useValue } from "../ui/useValue";

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

function ago(ts: number): string {
  const mins = Math.round((ts - Date.now()) / 60000);
  if (mins > -60) return relative.format(mins, "minute");
  const hours = Math.round(mins / 60);
  if (hours > -24) return relative.format(hours, "hour");
  return relative.format(Math.round(hours / 24), "day");
}

/**
 * The order the list was last shown in. Opening a campaign makes it the most
 * recent, but re-sorting while you're away would move its row, so the zoom
 * back to the list would land somewhere else. The order stays put until the
 * page reloads; new campaigns go on top.
 */
let shownOrder: string[] | null = null;

function stableOrder(list: CampaignSummary[]): CampaignSummary[] {
  if (shownOrder) {
    const rank = new Map(shownOrder.map((id, i) => [id, i]));
    list = [...list].sort((a, b) => (rank.get(a.id) ?? -1) - (rank.get(b.id) ?? -1));
  }
  shownOrder = list.map((c) => c.id);
  return list;
}

export function Lobby({ error }: { error: string | null }) {
  const list = stableOrder(useValue(campaigns));
  const ready = useValue(registryReady);
  const invite = useValue(pendingInvite);

  return (
    <main className="lobby">
      <LazyBackdrop />
      <div className="lobby-inner">
        <header className="lobby-header">
          <h1>Make a Move</h1>
        </header>

        {error && (
          <p className="lobby-error" role="alert">
            {error}
          </p>
        )}

        <section className="panel lobby-section" aria-labelledby="your-campaigns">
          <h2 id="your-campaigns" className="eyebrow">
            Your campaigns
          </h2>
          {!ready ? null : list.length === 0 ? (
            <div className="empty">
              <IconCampaign size={28} />
              No campaigns yet.
            </div>
          ) : (
            <ul className="campaign-list">
              {list.map((c) => (
                <CampaignRow key={c.id} c={c} />
              ))}
            </ul>
          )}
        </section>

        <NewCampaignForm />

        {invite && <JoinInviteDialog invite={invite} />}
      </div>
    </main>
  );
}

/** The icon backdrop is decorative and fairly heavy, so it loads after the lobby. */
function LazyBackdrop() {
  const [Backdrop, setBackdrop] = useState<ComponentType | null>(null);
  useEffect(() => {
    import("./IconBackdrop").then((m) => setBackdrop(() => m.IconBackdrop));
  }, []);
  return Backdrop ? <Backdrop /> : null;
}

function CampaignRow({ c }: { c: CampaignSummary }) {
  const [confirming, setConfirming] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const trigger = menuTrigger((x, y) => setMenu({ x, y }));

  return (
    <li className="campaign-row">
      <button
        type="button"
        className="campaign-open"
        data-campaign-id={c.id}
        onClick={() => goToCampaign(c.id)}
        onPointerDown={trigger.onPointerDown}
        onContextMenu={trigger.onContextMenu}
      >
        <span className="campaign-name">{c.name}</span>
        <span className="campaign-meta">
          {c.role === "gm" ? "GM" : "Player"} · {getSystem(c.systemId).name} · opened{" "}
          {ago(c.lastOpenedAt)}
        </span>
      </button>
      {menu && (
        <ContextMenu
          {...menu}
          label={`${c.name} actions`}
          items={[
            {
              label: "Delete…",
              Icon: IconDelete,
              danger: true,
              onSelect: () => setConfirming(true),
            },
          ]}
          onClose={() => setMenu(null)}
        />
      )}
      {confirming && (
        <DeleteCampaignDialog
          campaignName={c.name}
          onClose={() => setConfirming(false)}
          onConfirm={() => deleteLocalCampaign(c.id)}
        />
      )}
    </li>
  );
}

function DeleteCampaignDialog({
  campaignName,
  onClose,
  onConfirm,
}: {
  campaignName: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="lobby-modal panel"
      aria-labelledby="delete-campaign-title"
      onClose={onClose}
    >
      <h2 id="delete-campaign-title" className="eyebrow">
        Delete campaign?
      </h2>
      <p>
        Remove <strong>{campaignName}</strong> from this device? This cannot be undone.
      </p>
      <div className="form-actions">
        <button
          className="btn btn-ghost"
          type="button"
          autoFocus
          onClick={() => dialog.current?.close()}
        >
          Cancel
        </button>
        <button
          className="btn btn-danger"
          type="button"
          onClick={() => {
            onConfirm();
            dialog.current?.close();
          }}
        >
          Delete from This Device
        </button>
      </div>
    </dialog>
  );
}

function NewCampaignForm() {
  const [name, setName] = useState("");
  const [yourName, setYourName] = useState(device.value.name);
  const [systemId, setSystemId] = useState(NO_SYSTEM_ID);
  const [busy, setBusy] = useState(false);
  const system = listSystems().find((s) => s.id === systemId);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim() || !yourName.trim() || !system) return;
    setBusy(true);
    setDeviceName(yourName.trim());
    const id = await createCampaign(name.trim(), yourName.trim(), system.id);
    setBusy(false);
    goToCampaign(id);
  }

  return (
    <form className="panel lobby-section" onSubmit={submit} aria-labelledby="new-campaign">
      <h2 id="new-campaign" className="eyebrow">
        Start a campaign
      </h2>
      <div className="form-row">
        <label className="field">
          Campaign name
          <input
            value={name}
            onInput={(e) => setName(e.currentTarget.value)}
            placeholder="The Lost Barrows"
            required
          />
        </label>
        <label className="field">
          Your name
          <input
            value={yourName}
            onInput={(e) => setYourName(e.currentTarget.value)}
            placeholder="Robin"
            autoComplete="nickname"
            required
          />
        </label>
      </div>
      <div className="form-row">
        <label className="field">
          System
          <select value={systemId} onChange={(e) => setSystemId(e.currentTarget.value)} required>
            <option value="" disabled>
              Choose a system
            </option>
            {listSystems().map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-actions">
        <Button type="submit" variant="primary" disabled={busy}>
          <IconAdd size={22} /> Create Campaign
        </Button>
      </div>
    </form>
  );
}

function JoinInviteDialog({ invite }: { invite: NonNullable<typeof pendingInvite.value> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [yourName, setYourName] = useState(device.value.name);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!yourName.trim()) return;
    setDeviceName(yourName.trim());
    const id = joinCampaign(invite);
    dialog.current?.close();
    pendingInvite.value = null;
    goToCampaign(id);
  }

  return (
    <dialog
      ref={dialog}
      className="lobby-modal panel"
      aria-labelledby="join-campaign-title"
      onClose={() => (pendingInvite.value = null)}
    >
      <h2 id="join-campaign-title" className="eyebrow">
        Join a campaign
      </h2>
      <p>You&apos;ve been invited to a campaign.</p>
      <form onSubmit={submit}>
        <label className="field">
          Your name
          <input
            value={yourName}
            onInput={(e) => setYourName(e.currentTarget.value)}
            placeholder="Robin"
            autoComplete="nickname"
            autoFocus
            required
          />
        </label>
        <div className="form-actions">
          <button className="btn btn-ghost" type="button" onClick={() => dialog.current?.close()}>
            Cancel
          </button>
          <Button type="submit" disabled={!yourName.trim()}>
            Join
          </Button>
        </div>
      </form>
    </dialog>
  );
}
