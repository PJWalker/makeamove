import type { ReactNode } from "react";
import { closePopup } from "../ui/popup";
import Button from "../ui/Button";
import Dialog from "../workspace/Dialog";
import usePopupDialog from "../workspace/usePopupDialog";

function ConfirmDialog({
  title,
  confirmLabel,
  confirmVariant,
  onClose,
  onConfirm,
  children,
}: {
  title: string;
  confirmLabel: string;
  confirmVariant: "danger" | "primary";
  onClose: () => void;
  onConfirm: () => void;
  children: ReactNode;
}) {
  const reference = usePopupDialog();
  const close = () => { closePopup(reference.current, onClose); };

  return (
    <Dialog dialogRef={reference} title={title} onClose={onClose}>
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

export default ConfirmDialog;
