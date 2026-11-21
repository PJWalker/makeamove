/* eslint-disable jsx-a11y/prefer-tag-over-role -- The icon grid is a keyboard-selectable listbox, not a native select. */
import { useState } from "react";
import { actionForCombo, comboOf, shortcuts, showCombo, slotLook } from "./commands/custom";
import { bindKey, lookOfSlot } from "./commands/campaign";
import { RECORDER } from "./commands/keys";
import { findAction } from "./commands/views";
import type { Campaign } from "../campaign/campaign";
import { Button } from "../ui/Button";
import { ENTRY_ICONS, type EntryIconName } from "../ui/entryIcons";
import { closePopup } from "../ui/popup";
import { Dialog } from "./Dialog";
import { usePopupDialog } from "./usePopupDialog";
import { useQuery } from "../ui/useQuery";
import { useCampaign } from "./campaignContext";
import { CommitInput } from "../ui/CommitInput";

/*
 * Pop-ups for a player's own touches on an action (commands/custom.ts):
 * renaming a hotbar slot, giving it an icon, and binding a shortcut. The
 * hotbar's and the palette's menus open them.
 */

export function ActionDialogs({ campaign }: { campaign: Campaign }) {
  const context = useCampaign();
  const request = useQuery(context.table.actionEdit);
  if (!request) return null;
  // A new pop-up for each request, opened as it mounts so the menu item's morph catches it.
  const properties = { key: request.n, campaign, id: request.id, title: request.title };
  if (request.kind === "rename") return <RenameDialog {...properties} />;
  if (request.kind === "icon") return <IconDialog {...properties} />;
  return <ShortcutDialog {...properties} />;
}

interface Properties {
  campaign: Campaign;
  id: string;
  title: string;
}

function usePopup() {
  const context = useCampaign();
  const reference = usePopupDialog();
  const onClose = () => context.table.actionEdit.set(null);
  return {
    ref: reference,
    close: () => closePopup(reference.current, onClose),
    onClose,
  };
}

function RenameDialog({ campaign, id, title }: Properties) {
  const context = useCampaign();
  const { ref, close, onClose } = usePopup();
  const custom = slotLook(campaign, id).label;
  const done = (label: string | undefined) => {
    context.execute(lookOfSlot, { key: id, look: { label: label?.trim() || undefined } });
  };
  return (
    <Dialog dialogRef={ref} title="Rename" onClose={onClose}>
      <div className="dialog-form">
        <label className="field">
          Show on the hotbar as
          <CommitInput
            name="label"
            value={custom ?? title}
            // The field is the dialog's one input.
            // react-doctor-disable-next-line react-doctor/no-autofocus
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onCommit={(label) => done(label)}
            onBlur={close}
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
            }}
          />
        </label>
        {custom && (
          <div className="form-actions">
            <Button
              variant="ghost"
              className="form-actions-start"
              onClick={() => {
                done();
                close();
              }}
            >
              Use Its Own Name
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  );
}

/** Each icon once: some names share one (fighter and longsword). */
const CHOICES = (Object.keys(ENTRY_ICONS) as EntryIconName[]).filter(
  (name, index, all) => all.findIndex((n) => ENTRY_ICONS[n] === ENTRY_ICONS[name]) === index,
);

function IconDialog({ campaign, id, title }: Properties) {
  const context = useCampaign();
  const { ref, close, onClose } = usePopup();
  const current = slotLook(campaign, id).icon;
  const choose = (icon: EntryIconName | undefined) => {
    context.execute(lookOfSlot, { key: id, look: { icon } });
    close();
  };
  return (
    <Dialog
      dialogRef={ref}
      title={`Icon for ${slotLook(campaign, id).label ?? title}`}
      onClose={onClose}
    >
      <div className="dialog-form">
        <div className="icon-choices" role="listbox" aria-label="Icons">
          {CHOICES.map((name) => {
            const Icon = ENTRY_ICONS[name];
            return (
              <button
                key={name}
                type="button"
                role="option"
                className="icon-choice btn-ghost"
                aria-selected={name === current}
                aria-label={name.replace("-", " ")}
                data-tip={name.replace("-", " ")}
                onClick={() => choose(name)}
              >
                <Icon size={24} />
              </button>
            );
          })}
        </div>
        <div className="form-actions">
          <Button variant="ghost" disabled={!current} onClick={() => choose()}>
            Use Its Own Icon
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function ShortcutDialog({ campaign, id, title }: Properties) {
  const context = useCampaign();
  const { ref, close, onClose } = usePopup();
  const existing = shortcuts(campaign)[id] ?? null;
  const [combo, setCombo] = useState<string | null>(existing);
  const other = combo ? actionForCombo(shortcuts(campaign), combo) : undefined;
  const taken =
    other && other !== id
      ? (slotLook(campaign, other).label ?? findAction(context, other)?.title ?? "another action")
      : null;
  const save = (value: string | null) => {
    context.execute(bindKey, { key: id, combo: value });
    close();
  };
  return (
    <Dialog dialogRef={ref} title={`Shortcut for ${title}`} onClose={onClose}>
      <form
        className="dialog-form"
        onSubmit={(e) => {
          e.preventDefault();
          save(combo);
        }}
      >
        <label className="field">
          Press the keys to use
          <input
            name="keys"
            className={`input ${RECORDER}`}
            readOnly
            // The field is the dialog's one input.
            // react-doctor-disable-next-line react-doctor/no-autofocus
            autoFocus
            placeholder="Press a key…"
            value={combo ? showCombo(combo) : ""}
            onKeyDown={(e) => {
              // Escape closes and Tab moves on, as everywhere else; Enter saves.
              if (
                e.key === "Escape" ||
                e.key === "Enter" ||
                (e.key === "Tab" && !e.ctrlKey && !e.metaKey && !e.altKey)
              )
                return;
              e.preventDefault();
              e.stopPropagation();
              if (
                (e.key === "Backspace" || e.key === "Delete") &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey &&
                !e.shiftKey
              ) {
                setCombo(null);
                return;
              }
              const next = comboOf(e);
              if (next) setCombo(next);
            }}
          />
        </label>
        <output className="muted">
          {taken ? `Now on ${taken}. Saving moves it here.` : "Backspace clears it."}
        </output>
        <div className="form-actions">
          {existing && (
            <Button variant="ghost" className="form-actions-start" onClick={() => save(null)}>
              Remove Shortcut
            </Button>
          )}
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={combo === existing}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
