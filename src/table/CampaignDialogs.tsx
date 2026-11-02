import { IconOpenWindow } from "../ui/icons";
import type { ReactNode, RefObject } from "react";
import {
  setSystemCampaignData,
  systemCampaignData,
  type Campaign,
} from "../store/campaign";
import { getSystem } from "../systems";
import { colourOf } from "../scene/presence";
import { device, setDeviceColour, setDeviceName } from "../store/device";
import { useY } from "../store/useY";
import { GRID_TYPES } from "../scene/grid";
import { TOKEN_STYLES } from "../scene/types";
import { Button } from "../ui/Button";
import { Segmented } from "../ui/Segmented";
import { inviteUrl } from "../sync/invite";
import { useSignal } from "@preact/signals-react";
import { createPortal } from "react-dom";
import { useLayoutEffect, useRef } from "react";
import { closePopup, dragPopup, raisePopup, resizePopup } from "../ui/popup";
import { trackPointer } from "../ui/pointer";
import { formatCommaList, parseCommaList } from "../lib/list";
import { autohide, setAutohide } from "./canvasState";
import {
  RESIZE_CURSORS,
  RESIZE_DIRS,
  resizeRect,
  type ResizeDir,
} from "./resizeRect";
import { dragEntity, type DragEntity } from "./entityDrag";
import type { Icon } from "../ui/icons";
import type { menuTrigger } from "../ui/menuTrigger";
import {
  raiseWindow,
  startWindowDrag,
  updateWindow,
  layout,
  type DockItemId,
} from "./panelLayout";
import { WindowControls } from "./WindowControls";
import { CampaignEntityGraphic } from "./EntityGraphic";

/** The icon in a window's title bar that stands for what it shows. */
export interface WindowProxy {
  campaign: Campaign;
  kind: string;
  id: string;
  defaultIcon?: string | undefined;
  entity: DragEntity;
}
import { windowLayer } from "../ui/windows";
import { CampaignSystemSheet } from "./campaignSheets";

let dialogTransitionId = 0;

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
  const rolled = useSignal(false);
  const transitionName = useRef<string | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const preventNativeCancel = (event: Event) => event.preventDefault();
    dialog.addEventListener("cancel", preventNativeCancel);
    return () => dialog.removeEventListener("cancel", preventNativeCancel);
  }, [dialogRef]);
  if (!transitionName.current)
    transitionName.current = `dialog-window-${++dialogTransitionId}`;
  const win = dockId
    ? layout.value.floating.find((item) => item.id === dockId)
    : undefined;
  const windowStyle = {
    ...(win
      ? { left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z }
      : {}),
    viewTransitionName: transitionName.current,
  };
  const close = () => closePopup(dialogRef.current, onCloseRef.current);

  function onResizePointerDown(e: PointerEvent, dir: ResizeDir) {
    if (!dockId || !win) {
      resizePopup(dialogRef.current!, e, dir);
      return;
    }
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    raiseWindow(dockId);
    const start = { x: win.x, y: win.y, w: win.w, h: win.h };
    trackPointer(RESIZE_CURSORS[dir], (ev) => {
      updateWindow(
        dockId,
        resizeRect(start, dir, ev.clientX - e.clientX, ev.clientY - e.clientY),
      );
    });
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
      data-rolled={rolled.value}
      data-window-id={dockId}
      style={windowStyle}
      onSubmit={(event) => {
        if ((event.target as HTMLFormElement).method !== "dialog") return;
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
        if (
          e.key === "Escape" &&
          !e.defaultPrevented &&
          !expandedDialogTrigger
        ) {
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
                dragEntity(
                  e,
                  proxy.entity,
                  e.currentTarget.nextElementSibling as HTMLElement,
                );
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
        rolled={rolled.value}
        onToggleRoll={() => (rolled.value = !rolled.value)}
        onDragStart={(e) => {
          if (dockId && win) {
            const dialog = dialogRef.current!;
            startWindowDrag(
              dockId,
              e,
              e.clientX - dialog.offsetLeft,
              e.clientY - dialog.offsetTop,
            );
          } else dragPopup(dialogRef.current!, e);
        }}
        onClose={close}
      />
      <div className="dialog-body" inert={rolled.value}>
        {children}
      </div>
      {!rolled.value && <span className="resize-grip" aria-hidden="true" />}
      {!rolled.value &&
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

/** Everything you can set: for you on this device, and (for the GM) for the campaign. */
export function SettingsDialog({
  campaign,
  dialogRef,
}: {
  campaign: Campaign;
  dialogRef: RefObject<HTMLDialogElement | null>;
}) {
  const myName = useY(
    campaign.members,
    () => campaign.members.get(device.value.id)?.get("name") ?? "",
  );
  const colour = colourOf(device.value);
  return (
    <Dialog dialogRef={dialogRef} title="Settings">
      <section className="dialog-section form-layout">
        <h3 className="dialog-heading form-title">You</h3>
        <div className="dialog-subsection form-subsection">
          <h4 className="dialog-subheading form-subheading">Profile</h4>
          <label className="field">
            Your name
            <input
              value={myName}
              onChange={(e) => {
                const v = e.currentTarget.value.trim();
                if (!v) return;
                setDeviceName(v);
                campaign.ensureMember(v);
              }}
            />
          </label>
          <label className="field">
            Your colour
            <input
              type="color"
              value={colour}
              onInput={(e) => setDeviceColour(e.currentTarget.value)}
              aria-label="Your colour"
            />
          </label>
          <p className="muted">
            Used for your cursor, pings, and new tokens.
          </p>
        </div>
        <div className="dialog-subsection form-subsection">
          <h4 className="dialog-subheading form-subheading">Interface</h4>
          <div className="field">
            Sidebars and toolbars
            <Segmented
              label="Sidebars and toolbars"
              value={autohide.value ? "autohide" : "always"}
              options={[
                { id: "always", label: "Always shown" },
                { id: "autohide", label: "Autohide" },
              ]}
              onChange={(v) => setAutohide(v === "autohide")}
            />
            <span className="muted">
              Autohide hides them until your pointer nears a window edge.
            </span>
          </div>
        </div>
      </section>
      {campaign.isGm() && <CampaignSettings campaign={campaign} />}
      <SystemCampaignFields campaign={campaign} />
      <CampaignSystemSheet campaign={campaign} />
    </Dialog>
  );
}

function CampaignSettings({ campaign }: { campaign: Campaign }) {
  const name = useY(campaign.meta, () => campaign.name);
  const defaults = useY(campaign.meta, () => campaign.defaults());
  return (
    <section className="dialog-section form-layout">
      <h3 className="dialog-heading form-title">Campaign</h3>
      <div className="dialog-subsection form-subsection">
        <h4 className="dialog-subheading form-subheading">Details</h4>
        <label className="field">
          Campaign name
          <input
            value={name}
            onChange={(e) => {
              const v = e.currentTarget.value.trim();
              if (v) campaign.rename(v);
            }}
          />
        </label>
        <div className="field">
          Game system
          <span className="dialog-value">
            {getSystem(campaign.meta.get("systemId")).name}
          </span>
        </div>
      </div>
      <div className="dialog-subsection form-subsection">
        <h4 className="dialog-subheading form-subheading">Defaults</h4>
        <div className="field">
          New tokens
          <Segmented
            label="Default token style"
            value={defaults.tokenStyle}
            options={TOKEN_STYLES}
            onChange={(tokenStyle) => campaign.setDefaults({ tokenStyle })}
          />
        </div>
        <div className="field">
          Grid for new scenes
          <Segmented
            label="Default grid"
            value={defaults.gridType}
            options={GRID_TYPES}
            onChange={(gridType) => campaign.setDefaults({ gridType })}
          />
        </div>
      </div>
      <InviteField campaign={campaign} />
    </section>
  );
}

function SystemCampaignFields({ campaign }: { campaign: Campaign }) {
  const system = getSystem(campaign.meta.get("systemId"));
  const fields = system.campaignFields ?? [];
  const values = useY(campaign.systemData, () => systemCampaignData(campaign));
  if (!fields.length) return null;
  return (
    <section
      className="dialog-section form-layout"
      aria-label={system.campaignLabel ?? "Campaign state"}
    >
      <h3 className="dialog-heading form-title">
        {system.campaignLabel ?? "Campaign state"}
      </h3>
      {fields.map((field) => (
        <label key={field.id} className="field">
          {field.label}
          {field.type === "select" ? (
            <select
              value={String(values[field.id] ?? field.default)}
              disabled={!campaign.isGm()}
              onChange={(event) =>
                setSystemCampaignData(
                  campaign,
                  field.id,
                  event.currentTarget.value,
                )
              }
            >
              {field.options?.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : field.type === "multiselect" ? (
            (() => {
              const selected = new Set(
                parseCommaList(String(values[field.id] ?? "")).filter(Boolean),
              );
              return (
                <select
                  multiple
                  disabled={!campaign.isGm()}
                  onChange={(event) =>
                    setSystemCampaignData(
                      campaign,
                      field.id,
                      formatCommaList(
                        [...event.currentTarget.selectedOptions].map(
                          (option) => option.value,
                        ),
                      ),
                    )
                  }
                >
                  {field.options?.map((option) => (
                    <option
                      key={option.id}
                      value={option.id}
                      selected={selected.has(option.id)}
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
              );
            })()
          ) : (
            <input
              type={field.type === "number" ? "number" : "text"}
              min={field.type === "number" ? field.min : undefined}
              max={field.type === "number" ? field.max : undefined}
              value={String(values[field.id] ?? field.default)}
              disabled={!campaign.isGm()}
              onChange={(event) =>
                setSystemCampaignData(
                  campaign,
                  field.id,
                  field.type === "number"
                    ? Number(event.currentTarget.value)
                    : event.currentTarget.value,
                )
              }
            />
          )}
        </label>
      ))}
    </section>
  );
}

const SHORTCUTS: [string, string][] = [
  ["V", "Select"],
  ["H", "Pan"],
  ["P", "Draw"],
  ["R", "Shapes"],
  ["T", "Text"],
  ["M", "Measure"],
  ["G", "Ping"],
  ["E", "Erase drawings"],
  ["Space + drag", "Pan the map"],
  ["Scroll / pinch", "Zoom (trackpads: two fingers pan)"],
  ["⇧1", "Fit the scene"],
  ["⇧0", "Zoom to 100%"],
  ["Ctrl/⌘ + Z", "Undo your last change"],
  ["Ctrl/⌘ + ⇧Z", "Redo"],
  ["Ctrl/⌘ + D", "Duplicate"],
  ["Delete", "Delete the selection"],
  ["Arrows", "Nudge (⇧ for a whole cell)"],
  ["Alt + drag", "Move a token off the grid"],
  ["Ctrl/⌘ + \\", "Autohide sidebars and toolbars"],
  ["Ctrl/⌘ + K", "Search moves, tools, scenes and commands"],
];

export function HelpDialog({
  dialogRef,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
}) {
  return (
    <Dialog dialogRef={dialogRef} title="Help">
      <section className="dialog-section">
        <h3 className="dialog-heading">Keyboard shortcuts</h3>
        <dl className="shortcuts">
          {SHORTCUTS.map(([key, action]) => (
            <div key={key} className="shortcut">
              <dt>
                <kbd>{key}</kbd>
              </dt>
              <dd>{action}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="dialog-section">
        <h3 className="dialog-heading">Maps and tokens</h3>
        <p className="muted">
          Drop or paste images onto the canvas. Small, square images become
          tokens; anything bigger is placed as a map. Double-click a token to
          rename or restyle it; right-click anything to lock it, restack it or
          swap it between map and token. Undo only ever reverts your own
          changes.
        </p>
      </section>
      <section className="dialog-section">
        <h3 className="dialog-heading">Panels</h3>
        <p className="muted">
          Drag a sidebar tab, or a docked panel’s title, out onto the map to
          open it in its own window. Drag the window onto the left or right
          sidebar to dock it there, or use its dock button to put it back.
          Right-click a tab to move it to the other sidebar.
        </p>
      </section>
      <section className="dialog-section">
        <h3 className="dialog-heading">Credits</h3>
        <p className="muted">
          Icons by Lorc, Delapouite and contributors at{" "}
          <a href="https://game-icons.net" target="_blank" rel="noreferrer">
            game-icons.net
          </a>{" "}
          (CC BY 3.0), and{" "}
          <a
            href="https://fonts.google.com/icons"
            target="_blank"
            rel="noreferrer"
          >
            Material Symbols
          </a>{" "}
          (Apache 2.0).
        </p>
      </section>
    </Dialog>
  );
}

function InviteField({ campaign }: { campaign: Campaign }) {
  const copied = useSignal(false);
  const roomKey = useY(
    campaign.meta,
    () => campaign.meta.get("roomKey") as string | undefined,
  );
  if (!roomKey) return null;
  const url = inviteUrl({ campaignId: campaign.id, roomKey });
  return (
    <div className="dialog-subsection">
      <h4 className="dialog-subheading">Sharing</h4>
      <div className="field">
        Invite link
        <div className="form-row">
          <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
          <Button
            variant="secondary"
            onClick={async () => {
              await navigator.clipboard.writeText(url);
              copied.value = true;
              setTimeout(() => (copied.value = false), 1500);
            }}
          >
            {copied.value ? "Copied" : "Copy"}
          </Button>
        </div>
        <span className="muted">
          Anyone with this link can join. Keep it private.
        </span>
      </div>
    </div>
  );
}
