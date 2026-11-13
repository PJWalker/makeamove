import { useMemo, useState } from "react";
import {
  SheetFrame,
  SheetSectionView,
  useSheet,
  type SheetDrop,
  type SheetProps,
} from "../../workspace/DeclarativeSheet";
import { CharacterText } from "../../workspace/CharacterText";
import type { DragEntity } from "../../workspace/entityDrag";
import { STRUGGLES, struggleOfEntry } from "./struggles";
import { Button } from "../../ui/Button";
import { Counter } from "../../workspace/sheetParts";
import { addTreasureBoxes, wealthTierForBoxes, MAX_TREASURE_BOXES } from "./wealth";
import { DW2_GEAR, DW2_MAGIC_ITEMS } from "./gear";
import { giveItem, setData } from "../../workspace/commands/characters";
import { resolveCharacterStruggle, revealCharacterStruggle } from "./commands";
import { useCampaign } from "../../workspace/campaignContext";
import { parseInputNumber } from "../../lib/number";

function TreasureWealth({ sheet }: { sheet: ReturnType<typeof useSheet> }) {
  const ctx = useCampaign();
  const boxes = Number(sheet.c.data.treasureBoxes ?? 4);
  const wealth = wealthTierForBoxes(boxes);
  return (
    <section className="form-section sheet-section" aria-label="Treasure & Wealth">
      <h3 className="sheet-heading">Treasure & Wealth</h3>
      <p>{wealth.name}</p>
      <Counter
        label="Treasure"
        value={boxes}
        max={MAX_TREASURE_BOXES}
        disabled={!sheet.editable}
        onChange={(by) =>
          ctx.execute(setData, {
            id: sheet.c.id,
            key: "treasureBoxes",
            value: addTreasureBoxes(boxes, by),
          })
        }
      />
    </section>
  );
}

export function DungeonWorld2Sheet(props: SheetProps) {
  const ctx = useCampaign();
  const sheet = useSheet(props);
  const struggle = sheet.c.data.struggleRevealed
    ? STRUGGLES.find((entry) => entry.id === sheet.c.data.struggleId)
    : undefined;
  const revealed = sheet.c.data.struggleRevealed === true;
  const characterId = sheet.c.id;
  const isPc = sheet.c.kind === "pc";
  // A Struggle from the Libraries reveals it, while the character has none.
  const drop = useMemo<SheetDrop | undefined>(() => {
    if (!isPc || revealed) return undefined;
    const dropped = (entity: DragEntity) =>
      entity.libraryEntry?.kind === "option" ? struggleOfEntry(entity.libraryEntry.id) : undefined;
    return {
      accepts: (entity) => !!dropped(entity),
      drop: (entity) => {
        const struggle = dropped(entity);
        return (
          !!struggle && ctx.execute(revealCharacterStruggle, { characterId, struggle: struggle.id })
        );
      },
    };
  }, [isPc, revealed, ctx, characterId]);
  return (
    <SheetFrame {...sheet} drop={drop}>
      <SheetSectionView {...sheet} section={{ kind: "header" }} />
      <SheetSectionView
        {...sheet}
        section={{
          kind: "counters",
          items: [
            { label: "HP", resource: "hp", max: "maxHp" },
            { label: "XP", data: "xp", max: "xpNeeded" },
            { label: "Level", data: "level" },
            { label: "Armor", data: "armor" },
          ],
        }}
      />
      {struggle && (
        <section className="form-section sheet-section" aria-label="Current Struggle">
          <h3 className="sheet-heading">{struggle.name}</h3>
          <details>
            <summary>Struggle rules</summary>
            <p>{struggle.text}</p>
          </details>
          {struggle.track && (
            <label className="field">
              {struggle.track.name}
              <input
                type="number"
                min={0}
                max={struggle.track.max}
                step={1}
                value={Number(sheet.c.data.struggleProgress ?? struggle.track.initial ?? 0)}
                disabled={!sheet.editable}
                onChange={(event) => {
                  const value = parseInputNumber(event.currentTarget.value);
                  if (
                    value !== undefined &&
                    Number.isInteger(value) &&
                    value >= 0 &&
                    value <= struggle.track!.max
                  )
                    ctx.execute(setData, { id: sheet.c.id, key: "struggleProgress", value });
                }}
              />
            </label>
          )}
          <CharacterText
            campaign={sheet.campaign}
            c={sheet.c}
            field={`struggle:${struggle.id}`}
            label="Struggle prompts and notes"
            editable={sheet.editable}
          />
          <Button
            variant="secondary"
            disabled={!sheet.editable}
            onClick={() => ctx.execute(resolveCharacterStruggle, { characterId: sheet.c.id })}
          >
            Resolve Struggle
          </Button>
        </section>
      )}
      <SheetSectionView
        {...sheet}
        section={{
          kind: "advancement",
          xp: "xp",
          needed: "xpNeeded",
          field: "level",
          label: "Ready to level up.",
          button: "Level Up",
        }}
      />
      <SheetSectionView
        {...sheet}
        section={{
          kind: "derived",
          items: [
            { label: "Armor", value: "armor" },
            {
              label: "Damage",
              value: "damage",
              format: "die",
              plus: "damageBonus",
            },
          ],
        }}
      />
      <SheetSectionView
        {...sheet}
        section={{
          kind: "stats",
          label: "Stats & conditions",
          showScore: false,
        }}
      />
      <SheetSectionView {...sheet} section={{ kind: "actions", label: "Moves" }} />
      <ItemAward
        sheet={sheet}
        field="magicItemAward"
        claimedField="magicItemClaimed"
        tag="magic-item"
        title="Magic item advancement"
      />
      <ItemAward
        sheet={sheet}
        field="artifactAward"
        claimedField="artifactClaimed"
        tag="artifact"
        title="Artifact advancement"
      />
      <TreasureWealth sheet={sheet} />
      <SheetSectionView {...sheet} section={{ kind: "inventory" }} />
      <SheetSectionView
        {...sheet}
        section={{
          kind: "fields",
          label: "Origins and appearance",
          items: [
            { field: "pronouns", label: "Pronouns", type: "text" },
            { field: "ancestry", label: "Ancestry", type: "text" },
            { field: "community", label: "Community", type: "text" },
            { field: "background", label: "Background", type: "text" },
            { field: "appearance1", label: "Appearance", type: "text" },
            { field: "appearance2", label: "Appearance detail", type: "text" },
          ],
        }}
      />
    </SheetFrame>
  );
}

function ItemAward({
  sheet,
  field,
  claimedField,
  tag,
  title,
}: {
  sheet: ReturnType<typeof useSheet>;
  field: "magicItemAward" | "artifactAward";
  claimedField: "magicItemClaimed" | "artifactClaimed";
  tag: "magic-item" | "artifact";
  title: string;
}) {
  const ctx = useCampaign();
  const options =
    tag === "magic-item"
      ? [...DW2_GEAR.filter((item) => item.tags.includes("magic")), ...DW2_MAGIC_ITEMS]
      : DW2_MAGIC_ITEMS.filter((item) => item.tags.includes(tag));
  const [selected, setSelected] = useState(options[0]?.id ?? "");
  const pending =
    sheet.c.kind === "pc" && sheet.c.data[field] === true && sheet.c.data[claimedField] !== true;
  if (!pending) return null;
  return (
    <section className="form-section sheet-section" aria-label={title}>
      <h3 className="sheet-heading">{title}</h3>
      <label className="field">
        Choose an item
        <select value={selected} onChange={(event) => setSelected(event.currentTarget.value)}>
          {options.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <Button
        variant="secondary"
        disabled={!sheet.editable || !selected}
        onClick={() => {
          const item = options.find((entry) => entry.id === selected);
          if (!item) return;
          ctx.commands.batch(() => {
            ctx.execute(giveItem, { characterId: sheet.c.id, item });
            ctx.execute(setData, { id: sheet.c.id, key: claimedField, value: true });
          });
        }}
      >
        Add to Inventory
      </Button>
    </section>
  );
}

export function DungeonWorld2NpcSheet(props: SheetProps) {
  const sheet = useSheet(props);
  return (
    <SheetFrame {...sheet}>
      <SheetSectionView {...sheet} section={{ kind: "header" }} />
      <SheetSectionView
        {...sheet}
        section={{
          kind: "counters",
          items: [
            { label: "HP", resource: "hp", max: "maxHp" },
            { label: "Max HP", data: "maxHp", input: true },
            { label: "Armor", data: "armor" },
          ],
        }}
      />
      <SheetSectionView
        {...sheet}
        section={{
          kind: "npcFields",
          fields: ["description", "drive", "resources", "resists", "damage", "tags", "conditions"],
        }}
      />
      <TreasureWealth sheet={sheet} />
      <SheetSectionView {...sheet} section={{ kind: "inventory" }} />
    </SheetFrame>
  );
}
