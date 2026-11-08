import type { ReactNode, RefObject } from "react";
import { useId, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Campaign } from "../campaign/campaign";
import { IconOpenWindow, type Icon } from "../ui/icons";
import type { menuTrigger } from "../ui/menuTrigger";
import { closePopup, dragPopup, raisePopup, resizePopup } from "../ui/popup";
import { RESIZE_DIRS, type ResizeDir } from "../ui/resizeRect";
import { useValue } from "../ui/useValue";
import { windowLayer } from "../ui/windows";
import { dragEntity, type DragEntity } from "./entityDrag";
import { CampaignEntityGraphic } from "./EntityGraphic";
import {
  raiseWindow,
  startWindowDrag,
  startWindowResize,
  layout,
  useWindowRect,
  type DockItemId,
} from "./panelLayout";
import { WindowControls } from "./WindowControls";

/** The icon in a window's title bar that stands for what it shows. */
export interface WindowProxy {
  campaign: Campaign;
  kind: string;
  id: string;
  defaultIcon?: string | undefined;
  entity: DragEntity;
}

export function Dialog({
  dialogRef,
  title,
  onClose,
  proxy,
  graphicCampaign,
  graphicRef,
  graphicDefaultIcon,
  contextMenu,
  windowIcon,
  dockId,
  children,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  title: string;
  onClose?: () => void;
  /**
   * What the window shows, as an icon in its title bar that drags like a
   * link: onto a character, the hotbar, a note or the chat.
   */
  proxy?: WindowProxy | undefined;
  graphicCampaign?: Campaign | undefined;
  graphicRef?: { kind: string; id: string } | undefined;
  graphicDefaultIcon?: string | undefined;
  contextMenu?: ReturnType<typeof menuTrigger> | undefined;
  windowIcon?: Icon | undefined;
  dockId?: DockItemId | undefined;
  children: ReactNode;
}) {
  const [rolled, setRolled] = useState(false);
  // Its own transition name, so two windows can animate at once.
  const transitionName = `dialog-window-${useId().replace(/[^\w-]/g, "")}`;
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const preventNativeCancel = (event: Event) => event.preventDefault();
    dialog.addEventListener("cancel", preventNativeCancel);
    return () => dialog.removeEventListener("cancel", preventNativeCancel);
  }, [dialogRef]);
  const floating = useValue(layout).floating;
  const win = useWindowRect(dockId ? floating.find((item) => item.id === dockId) : undefined);
  const windowStyle = {
    ...(win ? { left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z } : {}),
    viewTransitionName: transitionName,
  };
  const close = () => closePopup(dialogRef.current, onClose);

  function onResizePointerDown(e: PointerEvent, dir: ResizeDir) {
    if (dockId && win) startWindowResize(dockId, e, dir);
    else resizePopup(dialogRef.current!, e, dir);
  }
  // Rendered in the window layer with the other windows: a non-modal dialog
  // would otherwise be clipped by the panel that opened it (the scene bar
  // clips its contents).
  return createPortal(
    <dialog
      ref={dialogRef}
      className="dialog window panel"
      closedby="none"
      aria-label={title}
      tabIndex={-1}
      data-rolled={rolled}
      data-window-id={dockId}
      style={windowStyle}
      onSubmit={(event) => {
        if (event.target.method !== "dialog") return;
        event.preventDefault();
        close();
      }}
      onPointerDown={(e) => {
        if (dockId) raiseWindow(dockId);
        else raisePopup(e.currentTarget);
        contextMenu?.onPointerDown(e);
      }}
      onContextMenu={(e) => contextMenu?.onContextMenu(e)}
      onKeyDown={(e) => {
        const expandedDialogTrigger = document.querySelector(
          '[aria-haspopup="dialog"][aria-expanded="true"]',
        );
        if (e.key === "Escape" && !e.defaultPrevented && !expandedDialogTrigger) {
          e.preventDefault();
          close();
        }
      }}
    >
      <WindowControls
        title={title}
        Icon={windowIcon ?? IconOpenWindow}
        iconContent={
          proxy ? (
            <span
              className="window-proxy"
              data-tip="Drag to link it, or onto a character or the hotbar"
              onPointerDown={(e) => {
                // Not a drag of the window itself.
                e.stopPropagation();
                dragEntity(e, proxy.entity, e.currentTarget.nextElementSibling as HTMLElement);
              }}
            >
              <CampaignEntityGraphic
                campaign={proxy.campaign}
                kind={proxy.kind}
                id={proxy.id}
                defaultIcon={proxy.defaultIcon}
                size={22}
              />
            </span>
          ) : graphicCampaign && graphicRef ? (
            <CampaignEntityGraphic
              campaign={graphicCampaign}
              kind={graphicRef.kind}
              id={graphicRef.id}
              defaultIcon={graphicDefaultIcon}
              size={22}
            />
          ) : undefined
        }
        rolled={rolled}
        onToggleRoll={() => setRolled(!rolled)}
        onDragStart={(e) => {
          if (dockId && win) {
            const dialog = dialogRef.current!;
            startWindowDrag(dockId, e, e.clientX - dialog.offsetLeft, e.clientY - dialog.offsetTop);
          } else dragPopup(dialogRef.current!, e);
        }}
        onClose={close}
      />
      <div className="dialog-body" inert={rolled}>
        {children}
      </div>
      {!rolled && <span className="resize-grip" aria-hidden="true" />}
      {!rolled &&
        RESIZE_DIRS.map((dir) => (
          <span
            key={dir}
            className="win-resize"
            data-dir={dir}
            aria-hidden="true"
            onPointerDown={(e) => onResizePointerDown(e.nativeEvent, dir)}
          />
        ))}
    </dialog>,
    windowLayer,
  );
}
