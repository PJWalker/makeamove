import { useState } from "react";
import { systemOf } from "../../features/characters/api";
import { derive } from "../../features/characters/store";
import { Button } from "../../ui/Button";
import type { ItemUseProps } from "../extensionTypes";
import { useGear } from "./commands";
import { useCampaign } from "../../workspace/campaignContext";

/** Controls for Dungeon World 2's charged items: a potion's or a wand's choice of effect. */
export function Dw2ItemUse({ campaign, character, item, editable }: ItemUseProps) {
  const ctx = useCampaign();
  const [choice, setChoice] = useState<"heal" | "clear-locked" | "drain" | "mark-condition">(
    "heal",
  );
  const [condition, setCondition] = useState(character.lockedConditions?.[0] ?? "");
  const definition = systemOf(campaign).items.find((entry) => entry.id === item.defId);
  if (item.uses === undefined) return null;
  const locked = character.lockedConditions ?? [];
  const lockedConditions = new Set(locked);
  const missingHp =
    (derive(character, systemOf(campaign)).values.maxHp ?? 0) > (character.resources.hp ?? 0);
  const outOfUses = (item.usesLeft ?? 0) <= 0;
  if (definition?.itemUse === "magic-wand") {
    const availableConditions = systemOf(campaign).conditions.filter(
      (entry) => !lockedConditions.has(entry.id),
    );
    return (
      <div className="inventory-item-use">
        <label className="field">
          Effect
          <select
            value={choice === "mark-condition" ? "mark-condition" : "drain"}
            disabled={!editable || outOfUses}
            onChange={(event) => setChoice(event.currentTarget.value as "drain" | "mark-condition")}
          >
            <option value="drain">Drain the wand until camp</option>
            <option value="mark-condition" disabled={!availableConditions.length}>
              Mark or lock a Condition instead
            </option>
          </select>
        </label>
        {choice === "mark-condition" && availableConditions.length > 0 && (
          <label className="field">
            Condition
            <select
              value={condition || availableConditions[0]!.id}
              disabled={!editable || outOfUses}
              onChange={(event) => setCondition(event.currentTarget.value)}
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
          disabled={
            !editable || outOfUses || (choice === "mark-condition" && !availableConditions.length)
          }
          onClick={() =>
            ctx.execute(useGear, {
              characterId: character.id,
              itemId: item.id,
              choice:
                choice === "mark-condition"
                  ? {
                      kind: "mark-condition",
                      condition: condition || availableConditions[0]!.id,
                    }
                  : { kind: "drain" },
            })
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
            value={choice}
            disabled={!editable || outOfUses}
            onChange={(event) => setChoice(event.currentTarget.value as "heal" | "clear-locked")}
          >
            <option value="heal">Recover half lost HP</option>
            <option value="clear-locked" disabled={!locked.length}>
              Clear a locked Condition
            </option>
          </select>
        </label>
        {choice === "clear-locked" && locked.length > 0 && (
          <label className="field">
            Locked Condition
            <select
              value={condition || locked[0]}
              disabled={!editable || outOfUses}
              onChange={(event) => setCondition(event.currentTarget.value)}
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
          disabled={
            !editable || outOfUses || (choice === "clear-locked" ? !locked.length : !missingHp)
          }
          onClick={() =>
            ctx.execute(useGear, {
              characterId: character.id,
              itemId: item.id,
              choice:
                choice === "heal"
                  ? { kind: "heal-half-lost" }
                  : { kind: "clear-locked", condition: condition || locked[0]! },
            })
          }
        >
          Use
        </Button>
      </div>
    );
  }
  return (
    <Button
      disabled={!editable || outOfUses}
      onClick={() => ctx.execute(useGear, { characterId: character.id, itemId: item.id })}
    >
      Use
    </Button>
  );
}
