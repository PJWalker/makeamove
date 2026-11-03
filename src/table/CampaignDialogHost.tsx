import { useSignalEffect } from "@preact/signals-react";
import { useRef } from "react";
import type { Campaign } from "../campaign/campaign";
import { openPopup } from "../ui/popup";
import { dialogRequest } from "./canvasState";
import { HelpDialog, SettingsDialog } from "./CampaignDialogs";
import { RelationshipsDialog } from "./Relationships";

/** Always mounted so campaign actions can open dialogs from any panel. */
export function CampaignDialogHost({ campaign }: { campaign: Campaign }) {
  const settingsRef = useRef<HTMLDialogElement>(null);
  const helpRef = useRef<HTMLDialogElement>(null);
  const relationshipsRef = useRef<HTMLDialogElement>(null);

  useSignalEffect(() => {
    const want = dialogRequest.value;
    if (!want) return;
    dialogRequest.value = null;
    const dialog = {
      settings: settingsRef,
      help: helpRef,
      relationships: relationshipsRef,
    }[want].current;
    openPopup(dialog);
  });

  return (
    <>
      <SettingsDialog campaign={campaign} dialogRef={settingsRef} />
      <HelpDialog dialogRef={helpRef} />
      <RelationshipsDialog campaign={campaign} dialogRef={relationshipsRef} />
    </>
  );
}
