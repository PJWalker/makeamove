import { useCallback, useState } from "react";
import { emptyRichText, plainText, type RichText } from "../data/richText";
import { RichTextField } from "../workspace/RichTextField";
import { canEdit, getCharacter, actingCharacterId, systemOf } from "../features/characters/api";
import { parseCommaList } from "../lib/list";
import { toggleSetValue } from "../lib/set";
import { listHomebrew, type HomebrewEntry } from "../features/homebrew/homebrew";
import {
  deleteHomebrewEntry,
  saveHomebrewGear,
  saveHomebrewMove,
} from "../workspace/commands/campaign";
import type { Campaign } from "../campaign/campaign";
import type { EntityGraphic } from "../media/images";
import { useQuery } from "../ui/useQuery";
import { librarySlot, moveSlot } from "../features/characters/hotbar";
import { closePopup } from "../ui/popup";
import { Dialog } from "../workspace/Dialog";
import { usePopupDialog } from "../workspace/usePopupDialog";
import type {
  ActionDef,
  CheckStep,
  Effect,
  GameSystem,
  ItemDef,
  TargetSpec,
} from "../systems/types";
import { Button } from "../ui/Button";
import { PanelActions } from "./PanelActions";
import { IconAdd, IconDelete, IconNewGear, IconNewMove } from "../ui/icons";
import { List, ListGroup } from "../ui/List";
import { Segmented } from "../ui/Segmented";
import { dragEntity } from "../workspace/entityDrag";
import { entity } from "../workspace/dragEntities";
import { EntryRow } from "../workspace/EntryWindow";
import { rollTag } from "../workspace/actionPresentation";
import { actionMenuItems } from "../workspace/actionMenu";
import { CampaignEntityGraphic } from "../workspace/EntityGraphic";
import { GraphicPicker } from "../ui/GraphicPicker";
import { getDefaultEntityGraphic, getEntityGraphic } from "../workspace/entityGraphics";
import { useCampaign } from "../workspace/campaignContext";
import { giveItem, startMove } from "../workspace/commands/characters";

/*
 * Items: the table's own gear and moves (homebrew/homebrew.ts), with
 * dialogs to make and change them. They're used like the system's: dragged onto a
 * character, given from here, or made from a character's sheet once learned.
 */

type Editing = { kind: "gear" | "move"; id: string | null } | null;

export function ItemsPanel({ campaign }: { campaign: Campaign }) {
  const { ctx, entries, system, editing, setEditing, fold, me, canAct, menuItemsFor, gear, moves } =
    useItemsPanel(campaign);
  return (
    <div className="panel-scroll items-panel">
      {editing && (
        <ItemDialog
          key={`${editing.kind}:${editing.id ?? "new"}`}
          campaign={campaign}
          system={system}
          editing={editing}
          entry={editing.id ? entries.find((entry) => entry.id === editing.id) : undefined}
          onClose={() => setEditing(null)}
        />
      )}
      <PanelActions>
        <Button icon={IconNewGear} onClick={() => setEditing({ kind: "gear", id: null })}>
          New Gear
        </Button>
        <Button icon={IconNewMove} onClick={() => setEditing({ kind: "move", id: null })}>
          New Move
        </Button>
      </PanelActions>
      {!entries.length && <p className="empty">No gear or moves yet.</p>}
      {gear.length > 0 && (
        <ListGroup label="Gear" count={gear.length} {...fold("gear")}>
          <List>
            {gear.map((entry) =>
              entry.kind === "gear" ? (
                <EntryRow
                  key={entry.id}
                  lead={
                    <CampaignEntityGraphic
                      campaign={campaign}
                      kind="item"
                      id={entry.id}
                      defaultIcon={entry.item.icon}
                      size={22}
                    />
                  }
                  name={entry.item.name}
                  openLabel="Edit"
                  meta={
                    [
                      entry.item.weight ? `${entry.item.weight} wt` : "",
                      entry.item.uses ? `${entry.item.uses} uses` : "",
                    ]
                      .filter(Boolean)
                      .join(" · ") || undefined
                  }
                  tip={entry.item.description}
                  onOpen={() => setEditing({ kind: "gear", id: entry.id })}
                  onPointerDown={(event) =>
                    dragEntity(ctx.canvas, event, entity(ctx, "item", entry.id, entry.item.name))
                  }
                  menuItems={menuItemsFor(entry)}
                >
                  <Button
                    variant="secondary"
                    disabled={!canAct}
                    onClick={() =>
                      me && ctx.execute(giveItem, { characterId: me.id, item: entry.item })
                    }
                  >
                    Add
                  </Button>
                </EntryRow>
              ) : null,
            )}
          </List>
        </ListGroup>
      )}
      {moves.length > 0 && (
        <ListGroup label="Moves" count={moves.length} {...fold("moves")}>
          <List>
            {moves.map((entry) =>
              entry.kind === "move" ? (
                <EntryRow
                  key={entry.id}
                  lead={
                    <CampaignEntityGraphic
                      campaign={campaign}
                      kind="move"
                      id={entry.id}
                      size={22}
                    />
                  }
                  name={entry.move.name}
                  openLabel="Edit"
                  tag={rollTag(system, entry.move)}
                  tip={`${plainText(entry.move.text)}\n\nDrag onto a character to teach it to them.`}
                  onOpen={() => setEditing({ kind: "move", id: entry.id })}
                  onPointerDown={(event) =>
                    dragEntity(ctx.canvas, event, entity(ctx, "move", entry.id, entry.move.name))
                  }
                  menuItems={menuItemsFor(entry)}
                >
                  <Button
                    variant="secondary"
                    disabled={!canAct}
                    onClick={() =>
                      me && ctx.execute(startMove, { characterId: me.id, move: entry.move.id })
                    }
                  >
                    Make
                  </Button>
                </EntryRow>
              ) : null,
            )}
          </List>
        </ListGroup>
      )}
    </div>
  );
}

function useItemsPanel(campaign: Campaign) {
  const ctx = useCampaign();
  const readEntries = useCallback(() => listHomebrew(campaign.homebrew), [campaign.homebrew]);
  const entries = useQuery(campaign.homebrew, readEntries);
  const system = systemOf(campaign);
  const [editing, setEditing] = useState<Editing>(null);
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const fold = (id: string) => ({
    open: !folded.has(id),
    onToggle: () => setFolded(toggleSetValue(folded, id)),
  });
  const meId = useQuery(campaign.members, () => actingCharacterId(campaign));
  const me = useQuery(campaign.characters, () => getCharacter(campaign, meId));
  const canAct = !!me && canEdit(campaign, me);
  const menuItemsFor = (e: HomebrewEntry & { id: string }) => {
    const actions =
      e.kind === "gear"
        ? actionMenuItems(ctx, [{ id: librarySlot(e.id), title: e.item.name }])
        : actionMenuItems(ctx, [{ id: moveSlot(e.id), title: e.move.name }]);
    const primary =
      e.kind === "gear"
        ? {
            label: me ? `Add to ${me.name}` : "Choose a Character",
            disabled: !canAct,
            onSelect: () => {
              if (me && canAct) ctx.execute(giveItem, { characterId: me.id, item: e.item });
            },
          }
        : {
            label: `Make ${e.move.name}`,
            disabled: !canAct,
            onSelect: () => {
              if (me && canAct) ctx.execute(startMove, { characterId: me.id, move: e.move.id });
            },
          };
    return [primary, ...(actions.length ? (["divider"] as const) : []), ...actions];
  };

  const gear = entries.filter((e) => e.kind === "gear");
  const moves = entries.filter((e) => e.kind === "move");
  return { ctx, entries, system, editing, setEditing, fold, me, canAct, menuItemsFor, gear, moves };
}

/** Makes or changes one of the table's gear or moves. */
function ItemDialog({
  campaign,
  system,
  editing: { kind, id },
  entry,
  onClose,
}: {
  campaign: Campaign;
  system: GameSystem;
  editing: NonNullable<Editing>;
  entry: (HomebrewEntry & { id: string }) | undefined;
  onClose: () => void;
}) {
  const ref = usePopupDialog();
  const done = () => closePopup(ref.current, onClose);
  const title = `${id ? "Edit" : "New"} ${kind === "gear" ? "Gear" : "Move"}`;
  return (
    <Dialog dialogRef={ref} title={title} onClose={onClose}>
      {kind === "gear" ? (
        <GearForm
          campaign={campaign}
          system={system}
          {...(entry?.kind === "gear" ? { initial: entry.item } : {})}
          onDone={done}
        />
      ) : (
        <MoveForm
          campaign={campaign}
          system={system}
          {...(entry?.kind === "move" ? { initial: entry.move } : {})}
          onDone={done}
        />
      )}
    </Dialog>
  );
}

/** A text input bound to a signal. */
function Text({
  label,
  value,
  multiline,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="field">
      {label}
      {multiline ? (
        <textarea
          rows={4}
          value={value}
          placeholder={placeholder}
          onInput={(e) => onChange(e.currentTarget.value)}
        />
      ) : (
        <input
          value={value}
          placeholder={placeholder}
          onInput={(e) => onChange(e.currentTarget.value)}
        />
      )}
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
}) {
  return (
    <label className="field">
      {label}
      <input
        type="number"
        min={min}
        value={value}
        onInput={(e) => onChange(Number(e.currentTarget.value) || 0)}
      />
    </label>
  );
}

const splitTags = (s: string) => parseCommaList(s).flatMap((t) => t.trim() || []);

/** An effect row in the gear form: a bonus to rolls with a stat, or a change to a derived value. */
type EffectRow =
  | { type: "rollBonus"; stat: string; value: number }
  | { type: "modify"; path: string; value: number };

function GearForm({
  campaign,
  system,
  initial,
  onDone,
}: {
  campaign: Campaign;
  system: GameSystem;
  initial?: ItemDef;
  onDone: () => void;
}) {
  const {
    name,
    setName,
    description,
    setDescription,
    weight,
    setWeight,
    uses,
    setUses,
    tags,
    setTags,
    equippable,
    setEquippable,
    graphic,
    setGraphic,
    resetGraphic,
    setResetGraphic,
    effects,
    setEffects,
    ready,
    save,
    setEffect,
  } = useGearForm(campaign, initial, onDone);

  return (
    <form
      className="creation-form form-layout"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <section className="form-section">
        <h4 className="form-heading">Details</h4>
        <Text label="Name" value={name} onChange={setName} />
        <Text label="Description" value={description} onChange={setDescription} multiline />
        <div className="sheet-row">
          <NumberField label="Weight" value={weight} onChange={setWeight} />
          <NumberField label="Uses" value={uses} onChange={setUses} />
        </div>
        <Text label="Tags" value={tags} onChange={setTags} placeholder="close, +1 armor" />
      </section>
      <section className="form-section">
        <h4 className="form-heading">Appearance and use</h4>
        <label className="stat-deb">
          <input type="checkbox" checked={equippable} onChange={() => setEquippable(!equippable)} />
          Equippable
        </label>
        <GraphicPicker
          graphic={
            resetGraphic
              ? getDefaultEntityGraphic(campaign, "item", initial?.id ?? "")
              : (graphic ?? getEntityGraphic(campaign, "item", initial?.id ?? ""))
          }
          onChange={(next) => {
            setGraphic(next);
            setResetGraphic(false);
          }}
          onReset={() => {
            setGraphic(undefined);
            setResetGraphic(true);
          }}
        />
      </section>
      <section className="form-section">
        <h4 className="form-heading">Effects</h4>
        <div className="form-fields">
          {effects.map((effect, index) => (
            <div
              key={`${effect.type}:${effect.type === "rollBonus" ? effect.stat : effect.path}`}
              className="sheet-row homebrew-effect"
            >
              <select
                aria-label="Effect"
                value={effect.type}
                onChange={(event) =>
                  setEffect(
                    index,
                    event.currentTarget.value === "rollBonus"
                      ? { type: "rollBonus", stat: "" }
                      : ({ type: "modify", path: "" } as never),
                  )
                }
              >
                <option value="rollBonus">Bonus to rolls</option>
                <option value="modify">Add to a value</option>
              </select>
              {effect.type === "rollBonus" ? (
                <select
                  aria-label="With stat"
                  value={effect.stat}
                  onChange={(event) => setEffect(index, { stat: event.currentTarget.value })}
                >
                  <option value="">Every roll</option>
                  {system.stats.map((stat) => (
                    <option key={stat.id} value={stat.id}>
                      with {stat.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  aria-label="Value name"
                  placeholder="armor, ac, speed"
                  value={effect.path}
                  onInput={(event) => setEffect(index, { path: event.currentTarget.value.trim() })}
                />
              )}
              <input
                className="homebrew-num"
                type="number"
                aria-label="Amount"
                value={effect.value}
                onInput={(event) =>
                  setEffect(index, { value: Number(event.currentTarget.value) || 0 })
                }
              />
              <Button
                variant="icon"
                label="Remove effect"
                onClick={() =>
                  setEffects(effects.filter((_, effectIndex) => effectIndex !== index))
                }
              >
                <IconDelete />
              </Button>
            </div>
          ))}
          <Button
            variant="ghost"
            onClick={() => setEffects([...effects, { type: "rollBonus", stat: "", value: 1 }])}
          >
            <IconAdd size={22} /> Add effect
          </Button>
        </div>
      </section>
      <FormActions campaign={campaign} id={initial?.id} ready={ready} onDone={onDone} />
    </form>
  );
}

function useGearForm(campaign: Campaign, initial: ItemDef | undefined, onDone: () => void) {
  const ctx = useCampaign();
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [weight, setWeight] = useState(initial?.weight ?? 0);
  const [uses, setUses] = useState(initial?.uses ?? 0);
  const [tags, setTags] = useState(() => (initial?.tags ?? []).join(", "));
  const [equippable, setEquippable] = useState(initial?.equippable ?? false);
  const [graphic, setGraphic] = useState<EntityGraphic | undefined>(
    initial?.id ? campaign.entityGraphics.get(`item:${initial.id}`) : undefined,
  );
  const [resetGraphic, setResetGraphic] = useState(false);
  const [effects, setEffects] = useState<EffectRow[]>(() =>
    (initial?.effects ?? []).flatMap((e): EffectRow[] =>
      e.type === "rollBonus"
        ? [{ type: "rollBonus", stat: e.stat ?? "", value: e.value }]
        : e.type === "modify" && e.op === "add"
          ? [{ type: "modify", path: e.path, value: e.value }]
          : [],
    ),
  );
  const ready = !!name.trim();
  const save = () => {
    if (!ready) return;
    const out: Effect[] = effects.map((e) =>
      e.type === "rollBonus"
        ? { type: "rollBonus", ...(e.stat ? { stat: e.stat } : {}), value: e.value }
        : { type: "modify", path: e.path, op: "add", value: e.value },
    );
    ctx.execute(saveHomebrewGear, {
      graphic: resetGraphic ? null : graphic,
      item: {
        id: initial?.id ?? "",
        name: name.trim(),
        description: description.trim(),
        weight: weight,
        ...(uses ? { uses: uses } : {}),
        tags: splitTags(tags),
        ...(out.length ? { effects: out } : {}),
        ...(equippable ? { equippable: true, active: "equipped" as const } : {}),
      },
    });
    onDone();
  };
  const setEffect = (i: number, patch: Partial<EffectRow>) =>
    setEffects(effects.map((e, j) => (j === i ? ({ ...e, ...patch } as EffectRow) : e)));
  return {
    name,
    setName,
    description,
    setDescription,
    weight,
    setWeight,
    uses,
    setUses,
    tags,
    setTags,
    equippable,
    setEquippable,
    graphic,
    setGraphic,
    resetGraphic,
    setResetGraphic,
    effects,
    setEffects,
    ready,
    save,
    setEffect,
  };
}

type RollKind = "none" | "stat" | "ask";
type TargetKind = "none" | "one" | "many";

/** What the move form edits, before it's a move. */
type MoveDraft = {
  name: string;
  category: string;
  trigger: string;
  text: RichText;
  graphic: EntityGraphic | undefined;
  resetGraphic: boolean;
  rolls: RollKind;
  stat: string;
  outcomes: Record<string, RichText>;
  targets: TargetKind;
  range: number;
};

function draftOf(
  campaign: Campaign,
  system: GameSystem,
  initial: ActionDef | undefined,
): MoveDraft {
  const check = initial?.steps.find((s): s is CheckStep => s.kind === "check");
  return {
    name: initial?.name ?? "",
    category: initial?.category ?? system.actionCategories[0]?.id ?? "",
    trigger: initial?.trigger ?? "",
    text: initial?.text ?? emptyRichText(),
    graphic: initial?.id ? campaign.entityGraphics.get(`move:${initial.id}`) : undefined,
    resetGraphic: false,
    rolls: !check ? "none" : check.ask?.kind === "stat" ? "ask" : "stat",
    stat: check?.stat ?? system.stats[0]?.id ?? "",
    outcomes: check?.outcomes ?? {},
    targets: initial?.target ? (initial.target.max === 1 ? "one" : "many") : "none",
    range: initial?.target?.range?.normal ?? 0,
  };
}

/** The move a draft describes. */
function moveFromDraft(system: GameSystem, draft: MoveDraft, id: string): ActionDef {
  const { rolls, targets } = draft;
  const steps: CheckStep[] =
    rolls === "none"
      ? []
      : [
          {
            kind: "check",
            ...(rolls === "stat" ? { stat: draft.stat } : { ask: { kind: "stat" as const } }),
            outcomes: Object.fromEntries(
              system.results.map((r) => [r.id, draft.outcomes[r.id] ?? emptyRichText()]),
            ),
          },
        ];
  const target: TargetSpec | undefined =
    targets === "none"
      ? undefined
      : {
          prompt: targets === "one" ? "Choose a target" : "Choose targets",
          min: 1,
          ...(targets === "one" ? { max: 1 } : {}),
          ...(draft.range ? { range: { normal: draft.range } } : {}),
        };
  return {
    id,
    name: draft.name.trim(),
    category: draft.category,
    trigger: draft.trigger.trim(),
    text: draft.text,
    steps,
    ...(target ? { target } : {}),
    tags: ["homebrew"],
  };
}

type SectionProps = {
  campaign: Campaign;
  system: GameSystem;
  draft: MoveDraft;
  patch: (changes: Partial<MoveDraft>) => void;
};

function MoveDetails({ campaign, system, draft, patch }: SectionProps) {
  return (
    <section className="form-section">
      <h4 className="form-heading">Details</h4>
      <Text label="Name" value={draft.name} onChange={(name) => patch({ name })} />
      <label className="field">
        Kind
        <select value={draft.category} onChange={(e) => patch({ category: e.currentTarget.value })}>
          {system.actionCategories.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      <Text
        label="Trigger"
        value={draft.trigger}
        onChange={(trigger) => patch({ trigger })}
        placeholder="When you…"
      />
      <RichTextField
        campaign={campaign}
        label="Text"
        value={draft.text}
        onChange={(text) => patch({ text })}
      />
    </section>
  );
}

function MoveAppearance({
  campaign,
  id,
  draft,
  patch,
}: Pick<SectionProps, "campaign" | "draft" | "patch"> & { id: string }) {
  return (
    <section className="form-section">
      <h4 className="form-heading">Appearance</h4>
      <GraphicPicker
        graphic={
          draft.resetGraphic
            ? getDefaultEntityGraphic(campaign, "move", id)
            : (draft.graphic ?? getEntityGraphic(campaign, "move", id))
        }
        onChange={(graphic) => patch({ graphic, resetGraphic: false })}
        onReset={() => patch({ graphic: undefined, resetGraphic: true })}
      />
    </section>
  );
}

function MoveRoll({ campaign, system, draft, patch }: SectionProps) {
  return (
    <section className="form-section">
      <h4 className="form-heading">Roll</h4>
      <div className="form-fields">
        <div className="field">
          Type
          <Segmented
            label="Roll type"
            value={draft.rolls}
            options={[
              { id: "none", label: "No roll" },
              { id: "stat", label: "With a stat" },
              { id: "ask", label: "Stat chosen when made" },
            ]}
            onChange={(rolls) => patch({ rolls })}
          />
          {draft.rolls === "stat" && (
            <select
              aria-label="Stat"
              value={draft.stat}
              onChange={(e) => patch({ stat: e.currentTarget.value })}
            >
              {system.stats.map((s) => (
                <option key={s.id} value={s.id}>
                  {system.baseRoll} + {s.name}
                </option>
              ))}
            </select>
          )}
        </div>
        {draft.rolls !== "none" &&
          system.results.map((r) => (
            <RichTextField
              key={r.id}
              campaign={campaign}
              label={r.label || "Otherwise"}
              value={draft.outcomes[r.id]}
              onChange={(value) => patch({ outcomes: { ...draft.outcomes, [r.id]: value } })}
            />
          ))}
      </div>
    </section>
  );
}

function MoveTargeting({ system, draft, patch }: Omit<SectionProps, "campaign">) {
  return (
    <section className="form-section">
      <h4 className="form-heading">Targets</h4>
      <div className="field">
        Selection
        <Segmented
          label="Target selection"
          value={draft.targets}
          options={[
            { id: "none", label: "None" },
            { id: "one", label: "One" },
            { id: "many", label: "Any number" },
          ]}
          onChange={(targets) => patch({ targets })}
        />
        {draft.targets !== "none" && (
          <NumberFieldInline
            label={`Range (${system.scene.unitName}, 0 for any)`}
            value={draft.range}
            onChange={(range) => patch({ range })}
          />
        )}
      </div>
    </section>
  );
}

function MoveForm({
  campaign,
  system,
  initial,
  onDone,
}: {
  campaign: Campaign;
  system: GameSystem;
  initial?: ActionDef;
  onDone: () => void;
}) {
  const ctx = useCampaign();
  const [draft, setDraft] = useState(() => draftOf(campaign, system, initial));
  const patch = (changes: Partial<MoveDraft>) => setDraft((now) => ({ ...now, ...changes }));
  const ready = !!draft.name.trim();
  const sections = { campaign, system, draft, patch };
  const save = () => {
    if (!ready) return;
    ctx.execute(saveHomebrewMove, {
      graphic: draft.resetGraphic ? null : draft.graphic,
      move: moveFromDraft(system, draft, initial?.id ?? ""),
    });
    onDone();
  };

  return (
    <form
      className="creation-form form-layout"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <MoveDetails {...sections} />
      <MoveAppearance campaign={campaign} id={initial?.id ?? ""} draft={draft} patch={patch} />
      <MoveRoll {...sections} />
      <MoveTargeting system={system} draft={draft} patch={patch} />
      <FormActions campaign={campaign} id={initial?.id} ready={ready} onDone={onDone} />
    </form>
  );
}

function NumberFieldInline({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="sheet-row">
      <input
        className="homebrew-num"
        type="number"
        min={0}
        value={value}
        onInput={(e) => onChange(Number(e.currentTarget.value) || 0)}
      />
      <span className="muted">{label}</span>
    </label>
  );
}

function FormActions({
  id,
  ready,
  onDone,
}: {
  campaign: Campaign;
  id?: string | undefined;
  ready: boolean;
  onDone: () => void;
}) {
  const ctx = useCampaign();
  return (
    <div className="form-actions">
      {id && (
        <Button
          variant="danger"
          className="form-actions-start"
          onClick={() => {
            ctx.execute(deleteHomebrewEntry, { id });
            onDone();
          }}
        >
          Delete
        </Button>
      )}
      <Button variant="ghost" onClick={onDone}>
        Cancel
      </Button>
      <Button variant="primary" type="submit" disabled={!ready}>
        Save
      </Button>
    </div>
  );
}
