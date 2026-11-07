import { useSignal, type Signal } from "@preact/signals-react";
import { plainText } from "../features/characters/trackers";
import {
  addItem,
  canEdit,
  getCharacter,
  selectedCharacterId,
  startMove,
  systemOf,
} from "../features/characters/api";
import { parseCommaList } from "../lib/list";
import { toggleSetValue } from "../lib/set";
import {
  deleteHomebrew,
  listHomebrew,
  saveGear,
  saveMove,
  type HomebrewEntry,
} from "../features/homebrew/homebrew";
import type { Campaign } from "../campaign/campaign";
import type { EntityGraphic } from "../graphics";
import { useY } from "../ui/useY";
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
import { IconAdd, IconBack, IconDelete } from "../ui/icons";
import { List, ListGroup } from "../ui/List";
import { Segmented } from "../ui/Segmented";
import { dragEntity, entity } from "./entityDrag";
import { EntryRow, rollTag } from "./EntryWindow";
import { actionMenuItems } from "./actionMenu";
import { CampaignEntityGraphic } from "./EntityGraphic";
import { GraphicPicker } from "../ui/GraphicPicker";
import { getDefaultEntityGraphic, getEntityGraphic, setEntityGraphic } from "./entityGraphics";

/*
 * Items: the table's own gear and moves (homebrew/homebrew.ts), with forms
 * to make and change them. They're used like the system's: dragged onto a
 * character, given from here, or made from a character's sheet once learned.
 */

type Editing = { kind: "gear" | "move"; id: string | null } | null;

export function ItemsPanel({ campaign }: { campaign: Campaign }) {
  const json = useY(campaign.homebrew, () => JSON.stringify(listHomebrew(campaign.homebrew)));
  const entries: (HomebrewEntry & { id: string })[] = JSON.parse(json);
  const system = systemOf(campaign);
  const editing = useSignal<Editing>(null);
  const folded = useSignal<Set<string>>(new Set());
  const fold = (id: string) => ({
    open: !folded.value.has(id),
    onToggle: () => (folded.value = toggleSetValue(folded.value, id)),
  });
  const meId = useY(campaign.members, () => selectedCharacterId(campaign));
  const me = useY(campaign.characters, () => getCharacter(campaign, meId));
  const canAct = !!me && canEdit(campaign, me);
  const menuItemsFor = (e: HomebrewEntry & { id: string }) => {
    const actions =
      e.kind === "gear"
        ? actionMenuItems(campaign, [{ id: `library:${e.id}`, title: e.item.name }])
        : actionMenuItems(campaign, [{ id: `move:${e.id}`, title: e.move.name }]);
    const primary =
      e.kind === "gear"
        ? {
            label: me ? `Add to ${me.name}` : "Choose a character",
            disabled: !canAct,
            onSelect: () => {
              if (me && canAct) addItem(campaign, me.id, e.item);
            },
          }
        : {
            label: `Make ${e.move.name}`,
            disabled: !canAct,
            onSelect: () => {
              if (me && canAct) startMove(campaign, me.id, e.move);
            },
          };
    return [primary, ...(actions.length ? (["divider"] as const) : []), ...actions];
  };

  if (editing.value) {
    const { kind, id } = editing.value;
    const found = id ? entries.find((e) => e.id === id) : undefined;
    const close = () => (editing.value = null);
    return (
      <div className="panel-scroll items-panel">
        <div className="sheet-row">
          <Button variant="ghost" size="sm" onClick={close}>
            <IconBack size={22} /> Items
          </Button>
        </div>
        {kind === "gear" ? (
          <GearForm
            campaign={campaign}
            system={system}
            {...(found?.kind === "gear" ? { initial: found.item } : {})}
            onDone={close}
          />
        ) : (
          <MoveForm
            campaign={campaign}
            system={system}
            {...(found?.kind === "move" ? { initial: found.move } : {})}
            onDone={close}
          />
        )}
      </div>
    );
  }

  const gear = entries.filter((e) => e.kind === "gear");
  const moves = entries.filter((e) => e.kind === "move");
  return (
    <div className="panel-scroll items-panel">
      <PanelActions>
        <Button size="sm" onClick={() => (editing.value = { kind: "gear", id: null })}>
          <IconAdd size={22} /> New gear
        </Button>
        <Button size="sm" onClick={() => (editing.value = { kind: "move", id: null })}>
          <IconAdd size={22} /> New move
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
                  onOpen={() => (editing.value = { kind: "gear", id: e.id })}
                  onPointerDown={(ev) =>
                    dragEntity(ev, entity(campaign, "item", e.id, e.item.name))
                  }
                  menuItems={menuItemsFor(e)}
                >
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!canAct}
                    onClick={() => me && addItem(campaign, me.id, e.item)}
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
                  onOpen={() => (editing.value = { kind: "move", id: e.id })}
                  onPointerDown={(ev) =>
                    dragEntity(ev, entity(campaign, "move", e.id, e.move.name))
                  }
                  menuItems={menuItemsFor(e)}
                >
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!canAct}
                    onClick={() => me && startMove(campaign, me.id, e.move)}
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

/** A text input bound to a signal. */
function Text({
  label,
  value,
  multiline,
  placeholder,
}: {
  label: string;
  value: Signal<string>;
  multiline?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="field">
      {label}
      {multiline ? (
        <textarea
          rows={4}
          value={value.value}
          placeholder={placeholder}
          onInput={(e) => (value.value = e.currentTarget.value)}
        />
      ) : (
        <input
          value={value.value}
          placeholder={placeholder}
          onInput={(e) => (value.value = e.currentTarget.value)}
        />
      )}
    </label>
  );
}

function NumberField({
  label,
  value,
  min = 0,
}: {
  label: string;
  value: Signal<number>;
  min?: number;
}) {
  return (
    <label className="field">
      {label}
      <input
        type="number"
        min={min}
        value={value.value}
        onInput={(e) => (value.value = Number(e.currentTarget.value) || 0)}
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
  const name = useSignal(initial?.name ?? "");
  const description = useSignal(initial?.description ?? "");
  const weight = useSignal(initial?.weight ?? 0);
  const uses = useSignal(initial?.uses ?? 0);
  const tags = useSignal((initial?.tags ?? []).join(", "));
  const equippable = useSignal(initial?.equippable ?? false);
  const graphic = useSignal<EntityGraphic | undefined>(
    initial?.id ? campaign.entityGraphics.get(`item:${initial.id}`) : undefined,
  );
  const resetGraphic = useSignal(false);
  const effects = useSignal<EffectRow[]>(
    (initial?.effects ?? []).flatMap((e): EffectRow[] =>
      e.type === "rollBonus"
        ? [{ type: "rollBonus", stat: e.stat ?? "", value: e.value }]
        : e.type === "modify" && e.op === "add"
          ? [{ type: "modify", path: e.path, value: e.value }]
          : [],
    ),
  );
  const ready = !!name.value.trim();
  const save = () => {
    if (!ready) return;
    const out: Effect[] = effects.value.map((e) =>
      e.type === "rollBonus"
        ? { type: "rollBonus", ...(e.stat ? { stat: e.stat } : {}), value: e.value }
        : { type: "modify", path: e.path, op: "add", value: e.value },
    );
    const id = saveGear(campaign.homebrew, {
      id: initial?.id ?? "",
      name: name.value.trim(),
      description: description.value.trim(),
      weight: weight.value,
      ...(uses.value ? { uses: uses.value } : {}),
      tags: splitTags(tags.value),
      ...(out.length ? { effects: out } : {}),
      ...(equippable.value ? { equippable: true, active: "equipped" as const } : {}),
    });
    setEntityGraphic(campaign, "item", id, resetGraphic.value ? undefined : graphic.value);
    onDone();
  };
  const setEffect = (i: number, patch: Partial<EffectRow>) =>
    (effects.value = effects.value.map((e, j) =>
      j === i ? ({ ...e, ...patch } as EffectRow) : e,
    ));

  return (
    <form
      className="creation-form homebrew-form form-layout"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <h3 className="form-title">{initial ? "Edit gear" : "New gear"}</h3>
      <section className="form-section">
        <h4 className="form-heading">Details</h4>
        <Text label="Name" value={name} />
        <Text label="Description" value={description} multiline />
        <div className="sheet-row">
          <NumberField label="Weight" value={weight} />
          <NumberField label="Uses" value={uses} />
        </div>
        <Text label="Tags" value={tags} placeholder="close, +1 armor" />
      </section>
      <section className="form-section">
        <h4 className="form-heading">Appearance and use</h4>
        <label className="stat-deb">
          <input
            type="checkbox"
            checked={equippable.value}
            onChange={() => (equippable.value = !equippable.value)}
          />
          Equippable
        </label>
        <GraphicPicker
          graphic={
            resetGraphic.value
              ? getDefaultEntityGraphic(campaign, "item", initial?.id ?? "")
              : (graphic.value ?? getEntityGraphic(campaign, "item", initial?.id ?? ""))
          }
          onChange={(next) => {
            graphic.value = next;
            resetGraphic.value = false;
          }}
          onReset={() => {
            graphic.value = undefined;
            resetGraphic.value = true;
          }}
        />
      </section>
      <section className="form-section">
        <h4 className="form-heading">Effects</h4>
        <div className="form-fields">
          {effects.value.map((e, i) => (
            <div key={i} className="sheet-row homebrew-effect">
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
                size="sm"
                label="Remove effect"
                onClick={() => (effects.value = effects.value.filter((_, j) => j !== i))}
              >
                <IconDelete />
              </Button>
            </div>
          ))}
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              (effects.value = [...effects.value, { type: "rollBonus", stat: "", value: 1 }])
            }
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
  const check = initial?.steps.find((s): s is CheckStep => s.kind === "check");
  const name = useSignal(initial?.name ?? "");
  const category = useSignal(initial?.category ?? system.actionCategories[0]?.id ?? "");
  const trigger = useSignal(initial?.trigger ?? "");
  const text = useSignal(initial?.text ?? "");
  const graphic = useSignal<EntityGraphic | undefined>(
    initial?.id ? campaign.entityGraphics.get(`move:${initial.id}`) : undefined,
  );
  const resetGraphic = useSignal(false);
  const rolls = useSignal<RollKind>(!check ? "none" : check.ask?.kind === "stat" ? "ask" : "stat");
  const stat = useSignal(check?.stat ?? system.stats[0]?.id ?? "");
  const outcomes = useSignal<Record<string, string>>(check?.outcomes ?? {});
  const targets = useSignal(initial?.target ? (initial.target.max === 1 ? "one" : "many") : "none");
  const range = useSignal(initial?.target?.range?.normal ?? 0);
  const ready = !!name.value.trim();

  const save = () => {
    if (!ready) return;
    const steps: CheckStep[] =
      rolls.value === "none"
        ? []
        : [
            {
              kind: "check",
              ...(rolls.value === "stat"
                ? { stat: stat.value }
                : { ask: { kind: "stat" as const } }),
              outcomes: Object.fromEntries(
                system.results.map((r) => [r.id, outcomes.value[r.id]?.trim() ?? ""]),
              ),
            },
          ];
    const target: TargetSpec | undefined =
      targets.value === "none"
        ? undefined
        : {
            prompt: targets.value === "one" ? "Choose a target" : "Choose targets",
            min: 1,
            ...(targets.value === "one" ? { max: 1 } : {}),
            ...(range.value ? { range: { normal: range.value } } : {}),
          };
    const id = saveMove(campaign.homebrew, {
      id: initial?.id ?? "",
      name: name.value.trim(),
      category: category.value,
      trigger: trigger.value.trim(),
      text: text.value.trim(),
      steps,
      ...(target ? { target } : {}),
      tags: ["homebrew"],
    });
    setEntityGraphic(campaign, "move", id, resetGraphic.value ? undefined : graphic.value);
    onDone();
  };

  return (
    <form
      className="creation-form homebrew-form form-layout"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <h3 className="form-title">{initial ? "Edit move" : "New move"}</h3>
      <section className="form-section">
        <h4 className="form-heading">Details</h4>
        <Text label="Name" value={name} />
        <label className="field">
          Kind
          <select value={category.value} onChange={(e) => (category.value = e.currentTarget.value)}>
            {system.actionCategories.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <Text label="Trigger" value={trigger} placeholder="When you…" />
        <Text label="Text" value={text} multiline />
      </section>
      <section className="form-section">
        <h4 className="form-heading">Appearance</h4>
        <GraphicPicker
          graphic={
            resetGraphic.value
              ? getDefaultEntityGraphic(campaign, "move", initial?.id ?? "")
              : (graphic.value ?? getEntityGraphic(campaign, "move", initial?.id ?? ""))
          }
          onChange={(next) => {
            graphic.value = next;
            resetGraphic.value = false;
          }}
          onReset={() => {
            graphic.value = undefined;
            resetGraphic.value = true;
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
              value={rolls.value}
              options={[
                { id: "none", label: "No roll" },
                { id: "stat", label: "With a stat" },
                { id: "ask", label: "Stat chosen when made" },
              ]}
              onChange={(v) => (rolls.value = v)}
            />
            {rolls.value === "stat" && (
              <select
                aria-label="Stat"
                value={stat.value}
                onChange={(e) => (stat.value = e.currentTarget.value)}
              >
                {system.stats.map((s) => (
                  <option key={s.id} value={s.id}>
                    {system.baseRoll} + {s.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          {rolls.value !== "none" &&
            system.results.map((r) => (
              <label key={r.id} className="field">
                {r.label || "Otherwise"}
                <textarea
                  rows={2}
                  value={outcomes.value[r.id] ?? ""}
                  onInput={(e) =>
                    (outcomes.value = {
                      ...outcomes.value,
                      [r.id]: e.currentTarget.value,
                    })
                  }
                />
              </label>
            ))}
        </div>
      </section>
      <section className="form-section">
        <h4 className="form-heading">Targets</h4>
        <div className="field">
          Selection
          <Segmented
            label="Target selection"
            value={targets.value}
            options={[
              { id: "none", label: "None" },
              { id: "one", label: "One" },
              { id: "many", label: "Any number" },
            ]}
            onChange={(v) => (targets.value = v)}
          />
          {targets.value !== "none" && (
            <NumberFieldInline
              label={`Range (${system.scene.unitName}, 0 for any)`}
              value={range}
            />
          )}
        </div>
      </section>
      <FormActions campaign={campaign} id={initial?.id} ready={ready} onDone={onDone} />
    </form>
  );
}

function NumberFieldInline({ label, value }: { label: string; value: Signal<number> }) {
  return (
    <label className="sheet-row">
      <input
        className="homebrew-num"
        type="number"
        min={0}
        value={value.value}
        onInput={(e) => (value.value = Number(e.currentTarget.value) || 0)}
      />
      <span className="muted">{label}</span>
    </label>
  );
}

function FormActions({
  campaign,
  id,
  ready,
  onDone,
}: {
  campaign: Campaign;
  id?: string | undefined;
  ready: boolean;
  onDone: () => void;
}) {
  return (
    <div className="form-actions">
      {id && (
        <Button
          variant="danger"
          onClick={() => {
            deleteHomebrew(campaign.homebrew, id);
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
