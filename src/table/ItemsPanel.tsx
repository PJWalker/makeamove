import { useState } from "react";
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
import { EntryRow, rollTag } from "../workspace/EntryWindow";
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
  const ctx = useCampaign();
  const json = useQuery(campaign.homebrew, () => JSON.stringify(listHomebrew(campaign.homebrew)));
  const entries = JSON.parse(json) as (HomebrewEntry & { id: string })[];
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
        ? actionMenuItems(ctx, [{ id: `library:${e.id}`, title: e.item.name }])
        : actionMenuItems(ctx, [{ id: `move:${e.id}`, title: e.move.name }]);
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
  return (
    <div className="panel-scroll items-panel">
      {editing && (
        <ItemDialog
          key={`${editing.kind}:${editing.id ?? "new"}`}
          campaign={campaign}
          system={system}
          editing={editing}
          entry={editing.id ? entries.find((e) => e.id === editing.id) : undefined}
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
            {gear.map((e) =>
              e.kind === "gear" ? (
                <EntryRow
                  key={e.id}
                  lead={
                    <CampaignEntityGraphic
                      campaign={campaign}
                      kind="item"
                      id={e.id}
                      defaultIcon={e.item.icon}
                      size={22}
                    />
                  }
                  name={e.item.name}
                  openLabel="Edit"
                  meta={
                    [
                      e.item.weight ? `${e.item.weight} wt` : "",
                      e.item.uses ? `${e.item.uses} uses` : "",
                    ]
                      .filter(Boolean)
                      .join(" · ") || undefined
                  }
                  tip={e.item.description}
                  onOpen={() => setEditing({ kind: "gear", id: e.id })}
                  onPointerDown={(ev) =>
                    dragEntity(ctx.canvas, ev, entity(ctx, "item", e.id, e.item.name))
                  }
                  menuItems={menuItemsFor(e)}
                >
                  <Button
                    variant="secondary"
                    disabled={!canAct}
                    onClick={() =>
                      me && ctx.execute(giveItem, { characterId: me.id, item: e.item })
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
            {moves.map((e) =>
              e.kind === "move" ? (
                <EntryRow
                  key={e.id}
                  lead={
                    <CampaignEntityGraphic campaign={campaign} kind="move" id={e.id} size={22} />
                  }
                  name={e.move.name}
                  openLabel="Edit"
                  tag={rollTag(system, e.move)}
                  tip={`${plainText(e.move.text)}\n\nDrag onto a character to teach it to them.`}
                  onOpen={() => setEditing({ kind: "move", id: e.id })}
                  onPointerDown={(ev) =>
                    dragEntity(ctx.canvas, ev, entity(ctx, "move", e.id, e.move.name))
                  }
                  menuItems={menuItemsFor(e)}
                >
                  <Button
                    variant="secondary"
                    disabled={!canAct}
                    onClick={() =>
                      me && ctx.execute(startMove, { characterId: me.id, move: e.move.id })
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

const splitTags = (s: string) =>
  parseCommaList(s)
    .map((t) => t.trim())
    .filter(Boolean);

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

  return (
    <form
      className="creation-form form-layout"
      onSubmit={(e) => {
        e.preventDefault();
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
          {effects.map((e, i) => (
            <div
              key={`${e.type}:${e.type === "rollBonus" ? e.stat : e.path}`}
              className="sheet-row homebrew-effect"
            >
              <select
                aria-label="Effect"
                value={e.type}
                onChange={(ev) =>
                  setEffect(
                    i,
                    ev.currentTarget.value === "rollBonus"
                      ? { type: "rollBonus", stat: "" }
                      : ({ type: "modify", path: "" } as never),
                  )
                }
              >
                <option value="rollBonus">Bonus to rolls</option>
                <option value="modify">Add to a value</option>
              </select>
              {e.type === "rollBonus" ? (
                <select
                  aria-label="With stat"
                  value={e.stat}
                  onChange={(ev) => setEffect(i, { stat: ev.currentTarget.value })}
                >
                  <option value="">Every roll</option>
                  {system.stats.map((s) => (
                    <option key={s.id} value={s.id}>
                      with {s.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  aria-label="Value name"
                  placeholder="armor, ac, speed"
                  value={e.path}
                  onInput={(ev) => setEffect(i, { path: ev.currentTarget.value.trim() })}
                />
              )}
              <input
                className="homebrew-num"
                type="number"
                aria-label="Amount"
                value={e.value}
                onInput={(ev) => setEffect(i, { value: Number(ev.currentTarget.value) || 0 })}
              />
              <Button
                variant="icon"
                label="Remove effect"
                onClick={() => setEffects(effects.filter((_, j) => j !== i))}
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

type RollKind = "none" | "stat" | "ask";

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
  const check = initial?.steps.find((s): s is CheckStep => s.kind === "check");
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(
    initial?.category ?? system.actionCategories[0]?.id ?? "",
  );
  const [trigger, setTrigger] = useState(initial?.trigger ?? "");
  const [text, setText] = useState<RichText>(initial?.text ?? emptyRichText());
  const [graphic, setGraphic] = useState<EntityGraphic | undefined>(
    initial?.id ? campaign.entityGraphics.get(`move:${initial.id}`) : undefined,
  );
  const [resetGraphic, setResetGraphic] = useState(false);
  const [rolls, setRolls] = useState<RollKind>(
    !check ? "none" : check.ask?.kind === "stat" ? "ask" : "stat",
  );
  const [stat, setStat] = useState(check?.stat ?? system.stats[0]?.id ?? "");
  const [outcomes, setOutcomes] = useState<Record<string, RichText>>(check?.outcomes ?? {});
  const [targets, setTargets] = useState(
    initial?.target ? (initial.target.max === 1 ? "one" : "many") : "none",
  );
  const [range, setRange] = useState(initial?.target?.range?.normal ?? 0);
  const ready = !!name.trim();

  const save = () => {
    if (!ready) return;
    const steps: CheckStep[] =
      rolls === "none"
        ? []
        : [
            {
              kind: "check",
              ...(rolls === "stat" ? { stat: stat } : { ask: { kind: "stat" as const } }),
              outcomes: Object.fromEntries(
                system.results.map((r) => [r.id, outcomes[r.id] ?? emptyRichText()]),
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
            ...(range ? { range: { normal: range } } : {}),
          };
    ctx.execute(saveHomebrewMove, {
      graphic: resetGraphic ? null : graphic,
      move: {
        id: initial?.id ?? "",
        name: name.trim(),
        category: category,
        trigger: trigger.trim(),
        text,
        steps,
        ...(target ? { target } : {}),
        tags: ["homebrew"],
      },
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
      <section className="form-section">
        <h4 className="form-heading">Details</h4>
        <Text label="Name" value={name} onChange={setName} />
        <label className="field">
          Kind
          <select value={category} onChange={(e) => setCategory(e.currentTarget.value)}>
            {system.actionCategories.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <Text label="Trigger" value={trigger} onChange={setTrigger} placeholder="When you…" />
        <RichTextField campaign={campaign} label="Text" value={text} onChange={setText} />
      </section>
      <section className="form-section">
        <h4 className="form-heading">Appearance</h4>
        <GraphicPicker
          graphic={
            resetGraphic
              ? getDefaultEntityGraphic(campaign, "move", initial?.id ?? "")
              : (graphic ?? getEntityGraphic(campaign, "move", initial?.id ?? ""))
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
        <h4 className="form-heading">Roll</h4>
        <div className="form-fields">
          <div className="field">
            Type
            <Segmented
              label="Roll type"
              value={rolls}
              options={[
                { id: "none", label: "No roll" },
                { id: "stat", label: "With a stat" },
                { id: "ask", label: "Stat chosen when made" },
              ]}
              onChange={(v) => setRolls(v)}
            />
            {rolls === "stat" && (
              <select
                aria-label="Stat"
                value={stat}
                onChange={(e) => setStat(e.currentTarget.value)}
              >
                {system.stats.map((s) => (
                  <option key={s.id} value={s.id}>
                    {system.baseRoll} + {s.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          {rolls !== "none" &&
            system.results.map((r) => (
              <RichTextField
                key={r.id}
                campaign={campaign}
                label={r.label || "Otherwise"}
                value={outcomes[r.id]}
                onChange={(value) => setOutcomes((current) => ({ ...current, [r.id]: value }))}
              />
            ))}
        </div>
      </section>
      <section className="form-section">
        <h4 className="form-heading">Targets</h4>
        <div className="field">
          Selection
          <Segmented
            label="Target selection"
            value={targets}
            options={[
              { id: "none", label: "None" },
              { id: "one", label: "One" },
              { id: "many", label: "Any number" },
            ]}
            onChange={(v) => setTargets(v)}
          />
          {targets !== "none" && (
            <NumberFieldInline
              label={`Range (${system.scene.unitName}, 0 for any)`}
              value={range}
              onChange={setRange}
            />
          )}
        </div>
      </section>
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
