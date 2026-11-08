import type { ReactNode } from "react";
import { closePopup } from "../ui/popup";
import { Button } from "../ui/Button";
import { Dialog } from "../workspace/Dialog";
import { usePopupDialog } from "../workspace/usePopupDialog";

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
  children: ReactNode;
}) {
  const ref = usePopupDialog();
  const close = () => closePopup(ref.current, onClose);

  return (
    <Dialog dialogRef={ref} title={title} onClose={onClose}>
      {children}
      <div className="form-actions">
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
