import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const PanelActionsContext = createContext<{
  target: HTMLDivElement | null;
  setTarget: (target: HTMLDivElement | null) => void;
} | null>(null);

export function PanelActionsProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  return (
    <PanelActionsContext value={{ target, setTarget }}>
      {children}
    </PanelActionsContext>
  );
}

export function PanelActionsSlot() {
  const context = useContext(PanelActionsContext);
  return <div className="panel-actions" ref={context?.setTarget} />;
}

export function PanelActions({ children }: { children: ReactNode }) {
  const context = useContext(PanelActionsContext);
  return context?.target ? createPortal(children, context.target) : null;
}