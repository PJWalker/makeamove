import { ColourPicker } from "../ui/ColourPicker";
import type { RefObject } from "react";
import { useState } from "react";
import { systemCampaignData, type Campaign } from "../campaign/campaign";
import { commaListOf, formatCommaList } from "../lib/list";
import { parseInputNumber } from "../lib/number";
import { device, setDeviceColour, setDeviceName } from "../platform/device";
import { GRID_TYPES } from "../scene/grid";
import { colourOf } from "../scene/presence";
import { TOKEN_STYLES } from "../scene/types";
import { inviteUrl } from "../sync/invite";
import { getSystem } from "../systems";
import { Button } from "../ui/Button";
import { Segmented } from "../ui/Segmented";
import { useQuery } from "../ui/useQuery";
import { BackupSettings } from "./BackupSettings";
import { CampaignSystemSheet } from "./campaignSheets";

import { autohide, setAutohide } from "./autohide";
import { Dialog } from "./Dialog";
import { useCampaign } from "./campaignContext";
import { renameCampaign, setCampaignField, setDefaults, setMyName } from "./commands/campaign";
import { can } from "./commands/views";

/** Everything you can set: for you on this device, and (for the GM) for the campaign. */
export function SettingsDialog({
  campaign,
  dialogRef,
}: {
  campaign: Campaign;
  dialogRef: RefObject<HTMLDialogElement | null>;
}) {
  const ctx = useCampaign();
  const me = useQuery(device);
  const hiding = useQuery(autohide);
  const myName = useQuery(campaign.members, () => campaign.members.get(me.id)?.get("name") ?? "");
  const colour = colourOf(me);
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
                ctx.execute(setMyName, { name: v });
              }}
            />
          </label>
          <div className="field">
            Your colour
            <ColourPicker label="Your colour" value={colour} onChange={setDeviceColour} />
          </div>
          <p className="muted">Used for your cursor, pings, and new tokens.</p>
        </div>
        <div className="dialog-subsection form-subsection">
          <h4 className="dialog-subheading form-subheading">Interface</h4>
          <div className="field">
            Sidebars and toolbars
            <Segmented
              label="Sidebars and toolbars"
              value={hiding ? "autohide" : "always"}
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
      {can(ctx, renameCampaign, { name: "" }) && <CampaignSettings campaign={campaign} />}
      <SystemCampaignFields campaign={campaign} />
      <CampaignSystemSheet campaign={campaign} />
      <BackupSettings campaign={campaign} />
    </Dialog>
  );
}

function CampaignSettings({ campaign }: { campaign: Campaign }) {
  const ctx = useCampaign();
  const name = useQuery(campaign.meta, () => campaign.name);
  const defaults = useQuery(campaign.meta, () => campaign.defaults());
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
              if (v) ctx.execute(renameCampaign, { name: v });
            }}
          />
        </label>
        <div className="field">
          Game system
          <span className="dialog-value">{getSystem(campaign.systemId).name}</span>
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
            onChange={(tokenStyle) => ctx.execute(setDefaults, { patch: { tokenStyle } })}
          />
        </div>
        <div className="field">
          Grid for new scenes
          <Segmented
            label="Default grid"
            value={defaults.gridType}
            options={GRID_TYPES}
            onChange={(gridType) => ctx.execute(setDefaults, { patch: { gridType } })}
          />
        </div>
      </div>
      <InviteField campaign={campaign} />
    </section>
  );
}

function SystemCampaignFields({ campaign }: { campaign: Campaign }) {
  const ctx = useCampaign();
  const system = getSystem(campaign.systemId);
  const fields = system.campaignFields ?? [];
  const values = useQuery(campaign.systemData, () => systemCampaignData(campaign));
  const editable = can(ctx, setCampaignField, { field: "", value: "" });
  if (!fields.length) return null;
  return (
    <section
      className="dialog-section form-layout"
      aria-label={system.campaignLabel ?? "Campaign state"}
    >
      <h3 className="dialog-heading form-title">{system.campaignLabel ?? "Campaign state"}</h3>
      {fields.map((field) => (
        <label key={field.id} className="field">
          {field.label}
          {field.type === "select" ? (
            <select
              value={String(values[field.id] ?? field.default)}
              disabled={!editable}
              onChange={(event) =>
                ctx.execute(setCampaignField, { field: field.id, value: event.currentTarget.value })
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
              const selected = new Set(commaListOf(values[field.id]));
              return (
                <select
                  multiple
                  aria-label={field.label}
                  disabled={!editable}
                  onChange={(event) =>
                    ctx.execute(setCampaignField, {
                      field: field.id,
                      value: formatCommaList(
                        [...event.currentTarget.selectedOptions].map((option) => option.value),
                      ),
                    })
                  }
                >
                  {field.options?.map((option) => (
                    <option key={option.id} value={option.id} selected={selected.has(option.id)}>
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
              disabled={!editable}
              onChange={(event) => {
                const input = event.currentTarget.value;
                const value = field.type === "number" ? parseInputNumber(input) : input;
                if (value === undefined) return;
                ctx.execute(setCampaignField, { field: field.id, value });
              }}
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

export function HelpDialog({ dialogRef }: { dialogRef: RefObject<HTMLDialogElement | null> }) {
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
          Drop or paste images onto the canvas. Small, square images become tokens; anything bigger
          is placed as a map. Double-click a token to rename or restyle it; right-click anything to
          lock it, restack it or swap it between map and token. Undo only ever reverts your own
          changes.
        </p>
      </section>
      <section className="dialog-section">
        <h3 className="dialog-heading">Panels</h3>
        <p className="muted">
          Drag a sidebar tab, or a docked panel’s title, out onto the map to open it in its own
          window. Drag the window onto the left or right sidebar to dock it there, or use its dock
          button to put it back. Right-click a tab to move it to the other sidebar.
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
          <a href="https://fonts.google.com/icons" target="_blank" rel="noreferrer">
            Material Symbols
          </a>{" "}
          (Apache 2.0).
        </p>
      </section>
    </Dialog>
  );
}

function InviteField({ campaign }: { campaign: Campaign }) {
  const [copied, setCopied] = useState(false);
  const roomKey = useQuery(campaign.meta, () => campaign.meta.get("roomKey"));
  if (!roomKey) return null;
  const url = inviteUrl({ campaignId: campaign.id, roomKey });
  return (
    <div className="dialog-subsection">
      <h4 className="dialog-subheading">Sharing</h4>
      <div className="field">
        Invite link
        <div className="form-row">
          <input
            aria-label="Invite link"
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button
            variant="secondary"
            onClick={() => {
              void navigator.clipboard.writeText(url).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <span className="muted">Anyone with this link can join. Keep it private.</span>
      </div>
    </div>
  );
}
