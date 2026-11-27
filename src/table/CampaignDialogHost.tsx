import { useEffect, useRef } from "react";
import { watch } from "../lib/store";
import type { Campaign } from "../campaign/campaign";
import { openPopup } from "../ui/popup";
import { HelpDialog, SettingsDialog } from "../workspace/CampaignDialogs";
import { useCampaign } from "../workspace/campaignContext";
import { useQuery } from "../ui/useQuery";
import type { Confirmation } from "../workspace/tableState";
import { ConfirmDialog } from "./ConfirmDialog";
import { RelationshipsDialog } from "./Relationships";

/** Always mounted so campaign actions can open dialogs from any panel. */
export function CampaignDialogHost({ campaign }: { campaign: Campaign }) {
  const context = useCampaign();
  const settingsReference = useRef<HTMLDialogElement>(null);
  const helpReference = useRef<HTMLDialogElement>(null);
  const relationshipsReference = useRef<HTMLDialogElement>(null);

  useEffect(
    () =>
      watch([context.canvas.dialogRequest], () => {
        const want = context.canvas.dialogRequest.value;
        if (!want) return;
        context.canvas.dialogRequest.set(null);
        const dialog = {
          settings: settingsReference,
          help: helpReference,
          relationships: relationshipsReference,
        }[want].current;
        openPopup(dialog);
      }),
    [context],
  );

  return (
    <>
      <SettingsDialog campaign={campaign} dialogRef={settingsReference} />
      <HelpDialog dialogRef={helpReference} />
      <RelationshipsDialog campaign={campaign} dialogRef={relationshipsReference} />
      <CommandConfirmation />
    </>
  );
}

/** Asks before running a command that wants confirming (commands/views.ts `invoke`). */
function CommandConfirmation() {
  const context = useCampaign();
  const asking = useQuery(context.table.confirming);
  if (!asking) return null;
  const { title, confirmLabel, danger } = asking.confirmation;
  return (
    <ConfirmDialog
      key={asking.n}
      title={title}
      confirmLabel={confirmLabel}
      confirmVariant={danger ? "danger" : "primary"}
      onClose={() => {
        context.table.confirming.set(null);
      }}
      onConfirm={() => {
        asking.run();
      }}
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
