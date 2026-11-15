import { useState, type ReactNode } from "react";
import { systemOf } from "../../features/characters/api";
import { derive } from "../../features/characters/store";
import { Button } from "../../ui/Button";
import type { ItemUseProps } from "../extensionTypes";
import { useGear } from "./commands";
import { useCampaign } from "../../workspace/campaignContext";

/** A Use button and an Effect selector around an item's own extra choice. */
function UseControls({
  effect,
  extra,
  canUse,
  disabled,
  onUse,
}: {
  effect: ReactNode;
  extra: ReactNode;
  canUse: boolean;
  disabled: boolean;
  onUse: () => void;
}) {
  return (
    <div className="inventory-item-use">
      {effect}
      {extra}
      <Button disabled={disabled || !canUse} onClick={onUse}>
        Use
      </Button>
    </div>
  );
}

/** A labelled selector over a list of ids. */
function ConditionSelect({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly { id: string; label: string }[];
  disabled: boolean;
  onChange: (id: string) => void;
}) {
  return (
    <label className="field">
      {label}
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {options.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** A magic wand: drain it until camp, or mark a Condition instead. */
function WandUse({ campaign, character, item, editable }: ItemUseProps) {
  const ctx = useCampaign();
  const [marking, setMarking] = useState(false);
  const [condition, setCondition] = useState("");
  const locked = new Set(character.lockedConditions);
  const available = systemOf(campaign).conditions.flatMap((entry) =>
    locked.has(entry.id) ? [] : [{ id: entry.id, label: entry.name }],
  );
  const disabled = !editable || (item.usesLeft ?? 0) <= 0;
  const markCondition = marking && available.length > 0;
  const chosen = condition || available[0]?.id || "";
  return (
    <UseControls
      disabled={disabled}
      canUse={!marking || available.length > 0}
      effect={
        <label className="field">
          Effect
          <select
            value={marking ? "mark-condition" : "drain"}
            disabled={disabled}
            onChange={(event) => setMarking(event.currentTarget.value === "mark-condition")}
          >
            <option value="drain">Drain the wand until camp</option>
            <option value="mark-condition" disabled={!available.length}>
              Mark or lock a Condition instead
            </option>
          </select>
        </label>
      }
      extra={
        markCondition && (
          <ConditionSelect
            label="Condition"
            value={chosen}
            options={available}
            disabled={disabled}
            onChange={setCondition}
          />
        )
      }
      onUse={() =>
        ctx.execute(useGear, {
          characterId: character.id,
          itemId: item.id,
          choice: marking ? { kind: "mark-condition", condition: chosen } : { kind: "drain" },
        })
      }
    />
  );
}

/** A healing potion: recover half the lost HP, or clear a locked Condition. */
function PotionUse({ campaign, character, item, editable }: ItemUseProps) {
  const ctx = useCampaign();
  const [clearing, setClearing] = useState(false);
  const [condition, setCondition] = useState(character.lockedConditions?.[0] ?? "");
  const locked = character.lockedConditions ?? [];
  const missingHp =
    (derive(character, systemOf(campaign)).values["maxHp"] ?? 0) > (character.resources["hp"] ?? 0);
  const disabled = !editable || (item.usesLeft ?? 0) <= 0;
  const chosen = condition || locked[0] || "";
  return (
    <UseControls
      disabled={disabled}
      canUse={clearing ? locked.length > 0 : missingHp}
      effect={
        <label className="field">
          Effect
          <select
            value={clearing ? "clear-locked" : "heal"}
            disabled={disabled}
            onChange={(event) => setClearing(event.currentTarget.value === "clear-locked")}
          >
            <option value="heal">Recover half lost HP</option>
            <option value="clear-locked" disabled={!locked.length}>
              Clear a locked Condition
            </option>
          </select>
        </label>
      }
      extra={
        clearing &&
        locked.length > 0 && (
          <ConditionSelect
            label="Locked Condition"
            value={chosen}
            options={locked.map((id) => ({ id, label: id }))}
            disabled={disabled}
            onChange={setCondition}
          />
        )
      }
      onUse={() =>
        ctx.execute(useGear, {
          characterId: character.id,
          itemId: item.id,
          choice: clearing
            ? { kind: "clear-locked", condition: chosen }
            : { kind: "heal-half-lost" },
        })
      }
    />
  );
}

/** Controls for Dungeon World 2's charged items: a potion's or a wand's choice of effect. */
export function Dw2ItemUse(props: ItemUseProps) {
  const ctx = useCampaign();
  const { campaign, character, item, editable } = props;
  if (item.uses === undefined) return null;
  const use = systemOf(campaign).items.find((entry) => entry.id === item.defId)?.itemUse;
  if (use === "magic-wand") return <WandUse {...props} />;
  if (use === "healing-potion") return <PotionUse {...props} />;
  return (
    <Button
      disabled={!editable || (item.usesLeft ?? 0) <= 0}
      onClick={() => ctx.execute(useGear, { characterId: character.id, itemId: item.id })}
    >
      Use
    </Button>
  );
}
