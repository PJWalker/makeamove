import type { ReactNode } from "react";
import type { Icon } from "../ui/icons";
import { IconClose } from "../ui/icons";
import { Button } from "../ui/Button";
import { withTransition } from "../ui/transition";

export function WindowControls({
  title,
  Icon: WindowIcon,
  iconContent,
  beforeTitle,
  afterTitle,
  rolled,
  onToggleRoll,
  onDragStart,
  onClose,
  closeLabel = "Close",
}: {
  title: string;
  Icon?: Icon;
  iconContent?: ReactNode;
  beforeTitle?: ReactNode;
  afterTitle?: ReactNode;
  rolled: boolean;
  onToggleRoll: () => void;
  onDragStart: (event: PointerEvent) => void;
  onClose?: () => void;
  closeLabel?: string;
}) {
  return (
    <header
      className="panel-header window-header"
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest("button")) return;
        onDragStart(event.nativeEvent);
      }}
      onDoubleClick={(event) => {
        if ((event.target as HTMLElement).closest("button")) return;
        const scope = event.currentTarget.closest<HTMLElement>(".window") ?? undefined;
        if (!rolled) scope?.focus({ preventScroll: true });
        void withTransition(onToggleRoll, scope ? { scope } : {});
      }}
    >
      {iconContent ??
        (WindowIcon && (
          <span className="window-icon" aria-hidden="true">
            <WindowIcon size={22} />
          </span>
        ))}
      {!rolled && beforeTitle}
      <h2 className="panel-title">{title}</h2>
      {!rolled && afterTitle}
      {!rolled && onClose && (
        <Button variant="icon" label={closeLabel} onClick={onClose}>
          <IconClose size={22} />
        </Button>
      )}
    </header>
  );
}
