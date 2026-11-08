import type { Campaign } from "../campaign/campaign";
import { windowLayer } from "../ui/windows";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import {
  dockTarget,
  setPanelClosed,
  floatingWindows,
  spawnedFromTab,
  raiseWindow,
  startWindowDrag,
  startWindowResize,
  useWindowPointer,
  useWindowRect,
  type FloatingWindow,
  type PanelId,
  PANELS,
} from "../workspace/panelLayout";
import { PanelContent, PaneToggle } from "./panels";
import { RESIZE_DIRS } from "../ui/resizeRect";
import { WindowControls } from "../workspace/WindowControls";
import { PanelActionsProvider, PanelActionsSlot } from "./PanelActions";
import { useValue } from "../ui/useValue";

/** Size of the tab a window morphs into. */
const TAB = 44;

export function FloatingWindows({ campaign }: { campaign: Campaign }) {
  const windows = useValue(floatingWindows);
  return createPortal(
    <>
      {windows.map((w) => (
        <Window key={w.id} win={w} campaign={campaign} />
      ))}
    </>,
    windowLayer,
  );
}

function Window({
  win: stored,
  campaign,
}: {
  win: FloatingWindow & { id: PanelId };
  campaign: Campaign;
}) {
  const win = useWindowRect(stored);
  const { label, Icon } = PANELS[win.id];
  const [rolled, setRolled] = useState(false);
  const pointer = useWindowPointer(win.id);
  const target = useValue(dockTarget);

  function onHeaderPointerDown(e: PointerEvent) {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    startWindowDrag(win.id, e, e.clientX - win.x, e.clientY - win.y);
  }

  // Over a sidebar the window morphs into the tab it would become, and back out again.
  const asTab = target !== null ? pointer : null;
  // The phase sticks until the next change, so re-rendering on pointer moves doesn't cut an animation short.
  // A window pulled out of a tab starts as the tab ('hidden') and grows from it when it leaves the sidebar.
  const [phase, setPhase] = useState<"in" | "out" | "hidden" | undefined>(() =>
    spawnedFromTab.has(win.id) ? "hidden" : undefined,
  );
  useEffect(() => {
    spawnedFromTab.delete(win.id);
  }, [win.id]);
  const morph = !pointer
    ? phase === "hidden"
      ? "hidden"
      : undefined
    : asTab
      ? phase === "hidden"
        ? "hidden"
        : "in"
      : phase
        ? "out"
        : undefined;
  if (morph !== phase) setPhase(morph);
  const to = pointer ?? { x: win.x, y: win.y };
  const toTab = `translate(${to.x - TAB / 2 - win.x}px, ${to.y - TAB / 2 - win.y}px) scale(${TAB / win.w}, ${TAB / win.h})`;

  return (
    <PanelActionsProvider>
      {asTab && (
        <div
          className="drag-tab panel"
          style={{ left: asTab.x - TAB / 2, top: asTab.y - TAB / 2 }}
          aria-hidden="true"
        >
          <Icon size={22} />
        </div>
      )}
      <section
        className="floating-window window panel"
        style={{
          left: win.x,
          top: win.y,
          width: win.w,
          height: win.h,
          zIndex: win.z,
          viewTransitionName: `panel-${win.id}`,
          "--to-tab": toTab,
        }}
        data-morph={morph}
        data-rolled={rolled}
        data-lifted={pointer !== null}
        aria-label={label}
        tabIndex={-1}
        onPointerDown={() => raiseWindow(win.id)}
      >
        <WindowControls
          title={label}
          Icon={Icon}
          beforeTitle={<PaneToggle id={win.id} />}
          afterTitle={!rolled && <PanelActionsSlot />}
          rolled={rolled}
          onToggleRoll={() => setRolled(!rolled)}
          onDragStart={onHeaderPointerDown}
          onClose={() => setPanelClosed(win.id, true)}
          closeLabel="Close (reopen from the campaign menu)"
        />
        {!rolled && (
          <div className="floating-window-content">
            <PanelContent id={win.id} campaign={campaign} />
          </div>
        )}
        {!rolled && <span className="resize-grip" aria-hidden="true" />}
        {!rolled &&
          RESIZE_DIRS.map((dir) => (
            <span
              key={dir}
              className="win-resize"
              data-dir={dir}
              aria-hidden="true"
              onPointerDown={(e) => startWindowResize(win.id, e.nativeEvent, dir)}
            />
          ))}
      </section>
    </PanelActionsProvider>
  );
}
