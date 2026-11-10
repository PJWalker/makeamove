import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const PanelActionsContext = createContext<{
  target: HTMLDivElement | null;
  setTarget: (target: HTMLDivElement | null) => void;
} | null>(null);

export function PanelActionsProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  return <PanelActionsContext value={{ target, setTarget }}>{children}</PanelActionsContext>;
}

/**
 * Where a panel's actions go in its title bar. When their labels don't fit
 * beside the title, the slot is marked data-compact and the buttons show just
 * their icons (panels.css).
 */
export function PanelActionsSlot() {
  const context = useContext(PanelActionsContext);
  const row = context?.target;
  const slotRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const slot = slotRef.current;
    const header = slot?.parentElement;
    if (!slot || !header || !row) return;
    // Measured with the labels showing, then compacted only if they overflow.
    const fit = () => {
      slot.removeAttribute("data-compact");
      slot.toggleAttribute("data-compact", row.offsetWidth > slot.clientWidth);
    };
    // The header for the room there is, the row for what's in it.
    const observer = new ResizeObserver(fit);
    observer.observe(header);
    observer.observe(row);
    return () => observer.disconnect();
  }, [row]);
  return (
    <div className="panel-actions" ref={slotRef}>
      <div className="panel-actions-row" ref={context?.setTarget} />
    </div>
  );
}

export function PanelActions({ children }: { children: ReactNode }) {
  const context = useContext(PanelActionsContext);
  return context?.target ? createPortal(children, context.target) : null;
}
