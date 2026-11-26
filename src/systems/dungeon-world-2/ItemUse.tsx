import { useState  } from "react";
import type {ReactNode} from "react";
import { systemOf } from "../../features/characters/api";
import { derive } from "../../features/characters/store";
import Button from "../../ui/Button";
import type { ItemUseProps as ItemUseProperties } from "../extensionTypes";
import { useCampaign } from "../../workspace/campaignContext";
import { useGear } from "./commands";

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

/** Whether an item has no uses left. */
const usedUp = (item: ItemUseProperties["item"]) => (item.usesLeft ?? 0) <= 0;

/** A labelled selector over a list of ids. */
function OptionSelect({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly { id: string; label: string; disabled?: boolean }[];
  disabled: boolean;
  onChange: (id: string) => void;
}) {
  return (
    <label className="field">
      {label}
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => { onChange(event.currentTarget.value); }}
      >
        {options.map((entry) => (
          <option key={entry.id} value={entry.id} disabled={entry.disabled}>
            {entry.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** A magic wand: drain it until camp, or mark a Condition instead. */
function WandUse({ campaign, character, item, editable }: ItemUseProperties) {
  const context = useCampaign();
  const [marking, setMarking] = useState(false);
  const [condition, setCondition] = useState("");
  const locked = new Set(character.lockedConditions);
  const available = systemOf(campaign).conditions.flatMap((entry) =>
    locked.has(entry.id) ? [] : [{ id: entry.id, label: entry.name }],
  );
  const disabled = !editable || usedUp(item);
  const markCondition = marking && available.length > 0;
  const chosen = condition || available[0]?.id || "";
  return (
    <UseControls
      disabled={disabled}
      canUse={!marking || available.length > 0}
      effect={
        <OptionSelect
          label="Effect"
          value={marking ? "mark-condition" : "drain"}
          options={[
            { id: "drain", label: "Drain the wand until camp" },
            {
              id: "mark-condition",
              label: "Mark or lock a Condition instead",
              disabled: available.length === 0,
            },
          ]}
          disabled={disabled}
          onChange={(id) => { setMarking(id === "mark-condition"); }}
        />
      }
      extra={
        markCondition && (
          <OptionSelect
            label="Condition"
            value={chosen}
            options={available}
            disabled={disabled}
            onChange={setCondition}
          />
        )
      }
      onUse={() =>
        context.execute(useGear, {
          characterId: character.id,
          itemId: item.id,
          choice: marking ? { kind: "mark-condition", condition: chosen } : { kind: "drain" },
        })
      }
    />
  );
}

/** A healing potion: recover half the lost HP, or clear a locked Condition. */
function PotionUse({ campaign, character, item, editable }: ItemUseProperties) {
  const context = useCampaign();
  const [clearing, setClearing] = useState(false);
  const [condition, setCondition] = useState(character.lockedConditions?.[0] ?? "");
  const locked = character.lockedConditions ?? [];
  const missingHp =
    (derive(character, systemOf(campaign)).values["maxHp"] ?? 0) > (character.resources["hp"] ?? 0);
  const disabled = !editable || usedUp(item);
  const chosen = condition || locked[0] || "";
  return (
    <UseControls
      disabled={disabled}
      canUse={clearing ? locked.length > 0 : missingHp}
      effect={
        <OptionSelect
          label="Effect"
          value={clearing ? "clear-locked" : "heal"}
          options={[
            { id: "heal", label: "Recover half lost HP" },
            { id: "clear-locked", label: "Clear a locked Condition", disabled: locked.length === 0 },
          ]}
          disabled={disabled}
          onChange={(id) => { setClearing(id === "clear-locked"); }}
        />
      }
      extra={
        clearing &&
        locked.length > 0 && (
          <OptionSelect
            label="Locked Condition"
            value={chosen}
            options={locked.map((id) => ({ id, label: id }))}
            disabled={disabled}
            onChange={setCondition}
          />
        )
      }
      onUse={() =>
        context.execute(useGear, {
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
function Dw2ItemUse(properties: ItemUseProperties) {
  const context = useCampaign();
  const { campaign, character, item, editable } = properties;
  if (item.uses === undefined) return null;
  const use = systemOf(campaign).items.find((entry) => entry.id === item.defId)?.itemUse;
  if (use === "magic-wand") return <WandUse {...properties} />;
  if (use === "healing-potion") return <PotionUse {...properties} />;
  return (
    <Button
      disabled={!editable || usedUp(item)}
      onClick={() => context.execute(useGear, { characterId: character.id, itemId: item.id })}
    >
      Use
    </Button>
  );
}

export default Dw2ItemUse;
