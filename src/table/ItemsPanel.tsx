import { useCallback, useState, type ReactNode } from "react";
import { useDraft } from "./useDraft";
import { emptyRichText, plainText, type RichText } from "../data/richText";
import { RichTextField } from "../workspace/RichTextField";
import { systemOf } from "../features/characters/api";
import { useActingCharacter } from "./useActingCharacter";
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
import type { MenuItem } from "../ui/ContextMenu";
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
type Entry = HomebrewEntry & { id: string };
type GearEntry = Extract<Entry, { kind: "gear" }>;
type MoveEntry = Extract<Entry, { kind: "move" }>;

export function ItemsPanel({ campaign }: { campaign: Campaign }) {
  const { ctx, entries, system, editing, setEditing, fold, canAct, actOn, menuItemsFor } =
    useItemsPanel(campaign);
  const gear = entries.filter((entry): entry is GearEntry => entry.kind === "gear");
  const moves = entries.filter((entry): entry is MoveEntry => entry.kind === "move");
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
            {gear.map((entry) => (
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
                meta={gearMeta(entry.item)}
                tip={entry.item.description}
                onOpen={() => setEditing({ kind: "gear", id: entry.id })}
                onPointerDown={(event) =>
                  dragEntity(ctx.canvas, event, entity(ctx, "item", entry.id, entry.item.name))
                }
                menuItems={menuItemsFor(entry)}
              >
                <Button variant="secondary" disabled={!canAct} onClick={() => actOn(entry)}>
                  Add
                </Button>
              </EntryRow>
            ))}
          </List>
        </ListGroup>
      )}
      {moves.length > 0 && (
        <ListGroup label="Moves" count={moves.length} {...fold("moves")}>
          <List>
            {moves.map((entry) => (
              <EntryRow
                key={entry.id}
                lead={
                  <CampaignEntityGraphic campaign={campaign} kind="move" id={entry.id} size={22} />
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
                <Button variant="secondary" disabled={!canAct} onClick={() => actOn(entry)}>
                  Make
                </Button>
              </EntryRow>
            ))}
          </List>
        </ListGroup>
      )}
    </div>
  );
}

/** A gear row's weight and uses, when it has either. */
function gearMeta(item: ItemDef): string | undefined {
  const parts = [item.weight ? `${item.weight} wt` : "", item.uses ? `${item.uses} uses` : ""];
  return parts.filter(Boolean).join(" · ") || undefined;
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
  const { me, canAct } = useActingCharacter(campaign);

  /** Gives the acting character this gear, or has them make this move. */
  const actOn = (entry: Entry) => {
    if (!me || !canAct) return;
    if (entry.kind === "gear") ctx.execute(giveItem, { characterId: me.id, item: entry.item });
    else ctx.execute(startMove, { characterId: me.id, move: entry.move.id });
  };

  const actionLabel = (entry: Entry) => {
    if (entry.kind === "move") return `Make ${entry.move.name}`;
    return me ? `Add to ${me.name}` : "Choose a Character";
  };

  const menuItemsFor = (entry: Entry): MenuItem[] => {
    const actions =
      entry.kind === "gear"
        ? actionMenuItems(ctx, [{ id: `library:${entry.id}`, title: entry.item.name }])
        : actionMenuItems(ctx, [{ id: `move:${entry.id}`, title: entry.move.name }]);
    return [
      { label: actionLabel(entry), disabled: !canAct, onSelect: () => actOn(entry) },
      ...(actions.length ? (["divider"] as const) : []),
      ...actions,
    ];
  };

  return { ctx, entries, system, editing, setEditing, fold, canAct, actOn, menuItemsFor };
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
  entry: Entry | undefined;
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

/** A labelled text input or textarea. */
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

/** A form's choice of picture: its own, or reset to the default (`resetGraphic`). */
type GraphicDraft = { graphic: EntityGraphic | undefined; resetGraphic: boolean };

function graphicDraftOf(campaign: Campaign, kind: "item" | "move", id: string | undefined) {
  return {
    graphic: id ? campaign.entityGraphics.get(`${kind}:${id}`) : undefined,
    resetGraphic: false,
  };
}

/** The picture to save: null resets it to the default. */
function savedGraphic({ graphic, resetGraphic }: GraphicDraft) {
  return resetGraphic ? null : graphic;
}

/** What the gear form edits, before it's an item. */
type GearDraft = GraphicDraft & {
  name: string;
  description: string;
  weight: number;
  uses: number;
  tags: string;
  equippable: boolean;
  effects: EffectRow[];
};

function gearDraftOf(campaign: Campaign, initial: ItemDef | undefined): GearDraft {
  return {
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    weight: initial?.weight ?? 0,
    uses: initial?.uses ?? 0,
    tags: (initial?.tags ?? []).join(", "),
    equippable: initial?.equippable ?? false,
    ...graphicDraftOf(campaign, "item", initial?.id),
    effects: (initial?.effects ?? []).flatMap(effectRowOf),
  };
}

/** The row that edits an effect, for the effects the form can edit. */
function effectRowOf(effect: Effect): EffectRow[] {
  if (effect.type === "rollBonus")
    return [{ type: "rollBonus", stat: effect.stat ?? "", value: effect.value }];
  if (effect.type === "modify" && effect.op === "add")
    return [{ type: "modify", path: effect.path, value: effect.value }];
  return [];
}

function effectOf(row: EffectRow): Effect {
  if (row.type === "rollBonus")
    return { type: "rollBonus", ...(row.stat ? { stat: row.stat } : {}), value: row.value };
  return { type: "modify", path: row.path, op: "add", value: row.value };
}

/** The item a draft describes. */
function itemFromDraft(draft: GearDraft, id: string): ItemDef {
  const effects = draft.effects.map(effectOf);
  return {
    id,
    name: draft.name.trim(),
    description: draft.description.trim(),
    weight: draft.weight,
    ...(draft.uses ? { uses: draft.uses } : {}),
    tags: splitTags(draft.tags),
    ...(effects.length ? { effects } : {}),
    ...(draft.equippable ? { equippable: true, active: "equipped" as const } : {}),
  };
}

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
  const ctx = useCampaign();
  const [draft, patch] = useDraft(() => gearDraftOf(campaign, initial));
  const { effects } = draft;
  const setEffect = (index: number, changes: Partial<EffectRow>) =>
    patch({
      effects: effects.map((row, i) => (i === index ? ({ ...row, ...changes } as EffectRow) : row)),
    });
  return (
    <HomebrewForm
      id={initial?.id}
      ready={!!draft.name.trim()}
      onSave={() =>
        ctx.execute(saveHomebrewGear, {
          graphic: savedGraphic(draft),
          item: itemFromDraft(draft, initial?.id ?? ""),
        })
      }
      onDone={onDone}
    >
      <section className="form-section">
        <h4 className="form-heading">Details</h4>
        <Text label="Name" value={draft.name} onChange={(name) => patch({ name })} />
        <Text
          label="Description"
          value={draft.description}
          onChange={(description) => patch({ description })}
          multiline
        />
        <div className="sheet-row">
          <NumberField
            label="Weight"
            value={draft.weight}
            onChange={(weight) => patch({ weight })}
          />
          <NumberField label="Uses" value={draft.uses} onChange={(uses) => patch({ uses })} />
        </div>
        <Text
          label="Tags"
          value={draft.tags}
          onChange={(tags) => patch({ tags })}
          placeholder="close, +1 armor"
        />
      </section>
      <section className="form-section">
        <h4 className="form-heading">Appearance and use</h4>
        <label className="stat-deb">
          <input
            type="checkbox"
            checked={draft.equippable}
            onChange={() => patch({ equippable: !draft.equippable })}
          />
          Equippable
        </label>
        <DraftGraphicPicker
          campaign={campaign}
          kind="item"
          id={initial?.id ?? ""}
          draft={draft}
          patch={patch}
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
                onClick={() => patch({ effects: effects.filter((_, i) => i !== index) })}
              >
                <IconDelete />
              </Button>
            </div>
          ))}
          <Button
            variant="ghost"
            onClick={() =>
              patch({ effects: [...effects, { type: "rollBonus", stat: "", value: 1 }] })
            }
          >
            <IconAdd size={22} /> Add effect
          </Button>
        </div>
      </section>
    </HomebrewForm>
  );
}

/** The picture picker for a draft, showing the default once it's been reset. */
function DraftGraphicPicker({
  campaign,
  kind,
  id,
  draft,
  patch,
}: {
  campaign: Campaign;
  kind: "item" | "move";
  id: string;
  draft: GraphicDraft;
  patch: (changes: GraphicDraft) => void;
}) {
  return (
    <GraphicPicker
      graphic={
        draft.resetGraphic
          ? getDefaultEntityGraphic(campaign, kind, id)
          : (draft.graphic ?? getEntityGraphic(campaign, kind, id))
      }
      onChange={(graphic) => patch({ graphic, resetGraphic: false })}
      onReset={() => patch({ graphic: undefined, resetGraphic: true })}
    />
  );
}

type RollKind = "none" | "stat" | "ask";
type TargetKind = "none" | "one" | "many";

/** What the move form edits, before it's a move. */
type MoveDraft = GraphicDraft & {
  name: string;
  category: string;
  trigger: string;
  text: RichText;
  rolls: RollKind;
  stat: string;
  outcomes: Record<string, RichText>;
  targets: TargetKind;
  range: number;
};

function moveDraftOf(
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
    ...graphicDraftOf(campaign, "move", initial?.id),
    rolls: rollKindOf(check),
    stat: check?.stat ?? system.stats[0]?.id ?? "",
    outcomes: check?.outcomes ?? {},
    targets: targetKindOf(initial?.target),
    range: initial?.target?.range?.normal ?? 0,
  };
}

function rollKindOf(check: CheckStep | undefined): RollKind {
  if (!check) return "none";
  return check.ask?.kind === "stat" ? "ask" : "stat";
}

function targetKindOf(target: TargetSpec | undefined): TargetKind {
  if (!target) return "none";
  return target.max === 1 ? "one" : "many";
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
      <DraftGraphicPicker campaign={campaign} kind="move" id={id} draft={draft} patch={patch} />
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
  const [draft, patch] = useDraft(() => moveDraftOf(campaign, system, initial));
  const sections = { campaign, system, draft, patch };
  return (
    <HomebrewForm
      id={initial?.id}
      ready={!!draft.name.trim()}
      onSave={() =>
        ctx.execute(saveHomebrewMove, {
          graphic: savedGraphic(draft),
          move: moveFromDraft(system, draft, initial?.id ?? ""),
        })
      }
      onDone={onDone}
    >
      <MoveDetails {...sections} />
      <MoveAppearance campaign={campaign} id={initial?.id ?? ""} draft={draft} patch={patch} />
      <MoveRoll {...sections} />
      <MoveTargeting system={system} draft={draft} patch={patch} />
    </HomebrewForm>
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

/** A gear or move form, saved on submit, with the entry's delete button once it exists. */
function HomebrewForm({
  id,
  ready,
  onSave,
  onDone,
  children,
}: {
  id: string | undefined;
  ready: boolean;
  onSave: () => void;
  onDone: () => void;
  children: ReactNode;
}) {
  const ctx = useCampaign();
  return (
    <form
      className="creation-form form-layout"
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready) return;
        onSave();
        onDone();
      }}
    >
      {children}
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
    </form>
  );
}
