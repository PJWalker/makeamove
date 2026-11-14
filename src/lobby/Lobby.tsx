import type { ComponentType, FormEvent, ReactNode } from "react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import {
  IconAdd,
  IconBackupFolder,
  IconCampaign,
  IconDelete,
  IconDice,
  IconExport,
  IconImport,
  IconMap,
  IconMembers,
} from "../ui/icons";
import { goToCampaign, pendingInvite } from "../navigation/router";
import { exportBackupFile, importBackupFile } from "../campaign/backup";
import { createCampaign, deleteLocalCampaign, joinCampaign } from "../campaign/campaign";
import { importFromFolder } from "../campaign/folderBackup";
import { canUseFolders } from "../platform/files";
import { store } from "../lib/store";
import { device, setDeviceName } from "../platform/device";
import { campaigns, registryReady, type CampaignSummary } from "../campaign/registry";
import { getSystem, listSystems, NO_SYSTEM_ID } from "../systems";
import { Button } from "../ui/Button";
import { ContextMenu } from "../ui/ContextMenu";
import { menuTrigger } from "../ui/menuTrigger";
import { leave, showFromOrigin } from "../ui/morph";
import { useQuery } from "../ui/useQuery";

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

/** Why the last backup import or export failed. */
const backupError = store<string | null>(null);

async function runBackup(act: () => Promise<unknown>) {
  backupError.value = null;
  try {
    await act();
  } catch (e) {
    backupError.value = e instanceof Error ? e.message : String(e);
  }
}

export function Lobby({ error }: { error: string | null }) {
  const list = stableOrder(useQuery(campaigns));
  const ready = useQuery(registryReady);
  const invite = useQuery(pendingInvite);
  const failed = useQuery(backupError);
  const [creating, setCreating] = useState(false);
  const create = () => setCreating(true);

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

        {!ready ? null : list.length === 0 ? (
          <Welcome onCreate={create} />
        ) : (
          <section className="panel lobby-section" aria-labelledby="your-campaigns">
            <div className="lobby-section-header">
              <h2 id="your-campaigns" className="eyebrow">
                Your Campaigns
              </h2>
              <Button variant="primary" icon={IconAdd} onClick={create}>
                New Campaign
              </Button>
            </div>
            <ul className="campaign-list">
              {list.map((c) => (
                <CampaignRow key={c.id} c={c} />
              ))}
            </ul>
          </section>
        )}

        {failed && (
          <p className="lobby-error" role="alert">
            {failed}
          </p>
        )}
        {ready && <ImportActions />}

        {creating && <NewCampaignDialog onClose={() => setCreating(false)} />}
        {invite && <JoinInviteDialog invite={invite} />}
      </div>
    </main>
  );
}

const FEATURES = [
  { Icon: IconMap, label: "Maps & Tokens" },
  { Icon: IconDice, label: "Dice & Combat" },
  { Icon: IconMembers, label: "Play Together" },
];

/** The lobby with no campaigns: what the table offers and the way in. */
function Welcome({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="panel lobby-section lobby-welcome" aria-labelledby="welcome-title">
      <div className="welcome-emblem" aria-hidden="true">
        <IconCampaign size={56} />
      </div>
      <h2 id="welcome-title" className="welcome-title">
        Start Your First Campaign
      </h2>
      <ul className="welcome-features">
        {FEATURES.map(({ Icon, label }) => (
          <li key={label}>
            <Icon size={28} />
            {label}
          </li>
        ))}
      </ul>
      <Button variant="primary" className="welcome-cta" icon={IconAdd} onClick={onCreate} autoFocus>
        Create a Campaign
      </Button>
    </section>
  );
}

function ImportActions() {
  return (
    <div className="lobby-imports">
      <Button variant="ghost" icon={IconImport} onClick={() => void runBackup(importBackupFile)}>
        Import Backup…
      </Button>
      {canUseFolders() && (
        <Button
          variant="ghost"
          icon={IconBackupFolder}
          onClick={() => void runBackup(importFromFolder)}
        >
          Import from Folder…
        </Button>
      )}
    </div>
  );
}

/**
 * A lobby modal, shown as soon as it mounts. The parent unmounts it on
 * onClose, which the dialog fires however it closes.
 */
function LobbyModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // In a layout effect, so a menu item's morph catches it (ui/morph.ts).
  useLayoutEffect(() => {
    const d = dialog.current;
    if (d) showFromOrigin(d, () => d.showModal());
  }, []);

  return (
    <dialog
      ref={dialog}
      className="lobby-modal panel"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        closeModal(e);
      }}
      onClose={onClose}
    >
      <h2 id={titleId} className="eyebrow">
        {title}
      </h2>
      {children}
    </dialog>
  );
}

/** Closes the modal the event's control sits in, shrinking it back into what opened it. */
function closeModal(e: { currentTarget: Element }) {
  const d = e.currentTarget.closest("dialog");
  if (d) void leave(d, () => d.close());
}

/** The fog backdrop is decorative and fairly heavy, so it loads after the lobby. */
function LazyBackdrop() {
  const [backdrop, setBackdrop] = useState<ComponentType | null>(null);
  useEffect(() => {
    void import("./FogBackdrop")
      .then((m) => setBackdrop(() => m.FogBackdrop))
      .catch((error: unknown) => console.error("Could not load the lobby backdrop", error));
  }, []);
  const Backdrop = backdrop;
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
        {...trigger}
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
              label: "Export Backup…",
              Icon: IconExport,
              onSelect: () => void runBackup(() => exportBackupFile(c.id, c.name)),
            },
            "divider",
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
          onConfirm={() => void deleteLocalCampaign(c.id)}
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
  return (
    <LobbyModal title="Delete Campaign?" onClose={onClose}>
      <>
        <p>
          Remove <strong>{campaignName}</strong> from this device? This cannot be undone.
        </p>
        <div className="form-actions">
          <Button variant="ghost" autoFocus onClick={closeModal}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={(e) => {
              onConfirm();
              closeModal(e);
            }}
          >
            Delete from This Device
          </Button>
        </div>
      </>
    </LobbyModal>
  );
}

function NewCampaignDialog({ onClose }: { onClose: () => void }) {
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
    goToCampaign(id);
  }

  return (
    <LobbyModal title="New Campaign" onClose={onClose}>
      <form onSubmit={(e) => void submit(e)}>
        <label className="field">
          Campaign name
          <input
            value={name}
            onInput={(e) => setName(e.currentTarget.value)}
            placeholder="The Lost Barrows"
            // The field is the dialog's one input.
            // react-doctor-disable-next-line react-doctor/no-autofocus
            autoFocus
            required
          />
        </label>
        <label className="field">
          Your name
          <input
            value={yourName}
            onInput={(e) => setYourName(e.currentTarget.value)}
            placeholder="Robin"
            autoComplete="name"
            required
          />
        </label>
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
        <div className="form-actions">
          <Button variant="ghost" onClick={closeModal}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={busy || !name.trim() || !yourName.trim()}
          >
            Create Campaign
          </Button>
        </div>
      </form>
    </LobbyModal>
  );
}

function JoinInviteDialog({ invite }: { invite: NonNullable<typeof pendingInvite.value> }) {
  const [yourName, setYourName] = useState(device.value.name);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!yourName.trim()) return;
    setDeviceName(yourName.trim());
    const id = joinCampaign(invite);
    pendingInvite.value = null;
    goToCampaign(id);
  }

  return (
    <LobbyModal title="Join a Campaign" onClose={() => (pendingInvite.value = null)}>
      <>
        <p>You&apos;ve been invited to a campaign.</p>
        <form onSubmit={(e) => submit(e)}>
          <label className="field">
            Your name
            <input
              value={yourName}
              onInput={(e) => setYourName(e.currentTarget.value)}
              placeholder="Robin"
              autoComplete="name"
              // The field is the dialog's one input.
              // react-doctor-disable-next-line react-doctor/no-autofocus
              autoFocus
              required
            />
          </label>
          <div className="form-actions">
            <Button variant="ghost" onClick={closeModal}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={!yourName.trim()}>
              Join
            </Button>
          </div>
        </form>
      </>
    </LobbyModal>
  );
}
