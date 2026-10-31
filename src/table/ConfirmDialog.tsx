import type { ComponentChildren } from "preact";
import { closePopup } from "../ui/popup";
import { Button } from "../ui/Button";
import { Dialog } from "./CampaignDialogs";
import { usePopupDialog } from "./usePopupDialog";

export function ConfirmDialog({
  title,
  confirmLabel,
  confirmVariant,
  onClose,
  onConfirm,
  children,
}: {
  title: string;
  confirmLabel: string;
  confirmVariant: "primary" | "danger";
  onClose: () => void;
  onConfirm: () => void;
  children: ComponentChildren;
}) {
  const ref = usePopupDialog();
  const close = () => closePopup(ref.current, onClose);

  return (
    <Dialog dialogRef={ref} title={title} onClose={onClose}>
      {children}
      <div class="form-actions">
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button
          variant={confirmVariant}
          onClick={() => {
            onConfirm();
            close();
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
