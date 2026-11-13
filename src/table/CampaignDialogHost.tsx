import { useEffect, useRef } from "react";
import { watch } from "../lib/store";
import type { Campaign } from "../campaign/campaign";
import { openPopup } from "../ui/popup";
import { HelpDialog, SettingsDialog } from "../workspace/CampaignDialogs";
import { RelationshipsDialog } from "./Relationships";
import { useCampaign } from "../workspace/campaignContext";
import { useQuery } from "../ui/useQuery";
import { ConfirmDialog } from "./ConfirmDialog";
import type { Confirmation } from "../workspace/commands/types";

/** Always mounted so campaign actions can open dialogs from any panel. */
export function CampaignDialogHost({ campaign }: { campaign: Campaign }) {
  const ctx = useCampaign();
  const settingsRef = useRef<HTMLDialogElement>(null);
  const helpRef = useRef<HTMLDialogElement>(null);
  const relationshipsRef = useRef<HTMLDialogElement>(null);

  useEffect(
    () =>
      watch([ctx.canvas.dialogRequest], () => {
        const want = ctx.canvas.dialogRequest.value;
        if (!want) return;
        ctx.canvas.dialogRequest.set(null);
        const dialog = {
          settings: settingsRef,
          help: helpRef,
          relationships: relationshipsRef,
        }[want].current;
        openPopup(dialog);
      }),
    [ctx],
  );

  return (
    <>
      <SettingsDialog campaign={campaign} dialogRef={settingsRef} />
      <HelpDialog dialogRef={helpRef} />
      <RelationshipsDialog campaign={campaign} dialogRef={relationshipsRef} />
      <CommandConfirmation />
    </>
  );
}

/** Asks before running a command that wants confirming (commands/views.ts `invoke`). */
function CommandConfirmation() {
  const ctx = useCampaign();
  const asking = useQuery(ctx.table.confirming);
  if (!asking) return null;
  const { title, confirmLabel, danger } = asking.confirmation;
  return (
    <ConfirmDialog
      key={asking.n}
      title={title}
      confirmLabel={confirmLabel}
      confirmVariant={danger ? "danger" : "primary"}
      onClose={() => ctx.table.confirming.set(null)}
      onConfirm={asking.run}
    >
      <p>
        <Emphasised {...asking.confirmation} />
      </p>
    </ConfirmDialog>
  );
}

function Emphasised({ body, subject }: Confirmation) {
  const at = subject ? body.indexOf(subject) : -1;
  if (!subject || at < 0) return body;
  return (
    <>
      {body.slice(0, at)}
      <strong>{subject}</strong>
      {body.slice(at + subject.length)}
    </>
  );
}
