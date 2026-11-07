import { useSignal } from "@preact/signals-react";
import { systemOf } from "../../features/characters/api";
import { derive } from "../../features/characters/store";
import { Button } from "../../ui/Button";
import type { ItemUseProps } from "../extensions";
import { consumeDungeonWorld2Item } from "./campaign";

/** Controls for Dungeon World 2's charged items: a potion's or a wand's choice of effect. */
export function Dw2ItemUse({ campaign, character, item, editable }: ItemUseProps) {
  const choice = useSignal<"heal" | "clear-locked" | "drain" | "mark-condition">("heal");
  const condition = useSignal(character.lockedConditions?.[0] ?? "");
  const definition = systemOf(campaign).items.find((entry) => entry.id === item.defId);
  if (item.uses === undefined) return null;
  const locked = character.lockedConditions ?? [];
  const missingHp =
    (derive(character, systemOf(campaign)).values.maxHp ?? 0) > (character.resources.hp ?? 0);
  const outOfUses = (item.usesLeft ?? 0) <= 0;
  if (definition?.itemUse === "magic-wand") {
    const availableConditions = systemOf(campaign).conditions.filter(
      (entry) => !locked.includes(entry.id),
    );
    return (
      <div className="inventory-item-use">
        <label className="field">
          Effect
          <select
            value={choice.value === "mark-condition" ? "mark-condition" : "drain"}
            disabled={!editable || outOfUses}
            onChange={(event) =>
              (choice.value = event.currentTarget.value as "drain" | "mark-condition")
            }
          >
            <option value="drain">Drain the wand until camp</option>
            <option value="mark-condition" disabled={!availableConditions.length}>
              Mark or lock a Condition instead
            </option>
          </select>
        </label>
        {choice.value === "mark-condition" && availableConditions.length > 0 && (
          <label className="field">
            Condition
            <select
              value={condition.value || availableConditions[0]!.id}
              disabled={!editable || outOfUses}
              onChange={(event) => (condition.value = event.currentTarget.value)}
            >
              {availableConditions.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <Button
          size="sm"
          disabled={
            !editable ||
            outOfUses ||
            (choice.value === "mark-condition" && !availableConditions.length)
          }
          onClick={() =>
            consumeDungeonWorld2Item(
              campaign,
              character.id,
              item.id,
              choice.value === "mark-condition"
                ? {
                    kind: "mark-condition",
                    condition: condition.value || availableConditions[0]!.id,
                  }
                : { kind: "drain" },
            )
          }
        >
          Use
        </Button>
      </div>
    );
  }
  if (definition?.itemUse === "healing-potion") {
    return (
      <div className="inventory-item-use">
        <label className="field">
          Effect
          <select
            value={choice.value}
            disabled={!editable || outOfUses}
            onChange={(event) =>
              (choice.value = event.currentTarget.value as "heal" | "clear-locked")
            }
          >
            <option value="heal">Recover half lost HP</option>
            <option value="clear-locked" disabled={!locked.length}>
              Clear a locked Condition
            </option>
          </select>
        </label>
        {choice.value === "clear-locked" && locked.length > 0 && (
          <label className="field">
            Locked Condition
            <select
              value={condition.value || locked[0]}
              disabled={!editable || outOfUses}
              onChange={(event) => (condition.value = event.currentTarget.value)}
            >
              {locked.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </label>
        )}
        <Button
          size="sm"
          disabled={
            !editable ||
            outOfUses ||
            (choice.value === "clear-locked" ? !locked.length : !missingHp)
          }
          onClick={() =>
            consumeDungeonWorld2Item(
              campaign,
              character.id,
              item.id,
              choice.value === "heal"
                ? { kind: "heal-half-lost" }
                : { kind: "clear-locked", condition: condition.value || locked[0]! },
            )
          }
        >
          Use
        </Button>
      </div>
    );
  }
  return (
    <Button
      size="sm"
      disabled={!editable || outOfUses}
      onClick={() => consumeDungeonWorld2Item(campaign, character.id, item.id)}
    >
      Use
    </Button>
  );
}
