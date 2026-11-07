import { useSignal } from "@preact/signals-react";
import {
  SheetFrame,
  SheetSectionView,
  useSheet,
  type SheetProps,
} from "../../table/DeclarativeSheet";
import { CharacterText } from "../../table/CharacterText";
import { addItem, resolveStruggle, setData } from "../../features/characters/api";
import { STRUGGLES } from "./struggles";
import { Button } from "../../ui/Button";
import { Counter } from "../../table/sheetParts";
import { addTreasureBoxes, wealthTierForBoxes, MAX_TREASURE_BOXES } from "./wealth";
import { DW2_GEAR, DW2_MAGIC_ITEMS } from "./gear";

function TreasureWealth({ sheet }: { sheet: ReturnType<typeof useSheet> }) {
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
          setData(sheet.campaign, sheet.c.id, "treasureBoxes", addTreasureBoxes(boxes, by))
        }
      />
    </section>
  );
}

export function DungeonWorld2Sheet(props: SheetProps) {
  const sheet = useSheet(props);
  const struggle = sheet.c.data.struggleRevealed
    ? STRUGGLES.find((entry) => entry.id === sheet.c.data.struggleId)
    : undefined;
  return (
    <SheetFrame {...sheet}>
      <SheetSectionView {...sheet} section={{ kind: "header" }} />
      <SheetSectionView {...sheet} section={{ kind: "choices", choices: ["class"] }} />
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
                  const value = Number(event.currentTarget.value);
                  if (Number.isInteger(value) && value >= 0 && value <= struggle.track!.max)
                    setData(sheet.campaign, sheet.c.id, "struggleProgress", value);
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
            onClick={() => resolveStruggle(sheet.campaign, sheet.c.id)}
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
          button: "Level up",
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
            { label: "Bloodied at", value: "bloodiedAt" },
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
  const options =
    tag === "magic-item"
      ? [...DW2_GEAR.filter((item) => item.tags.includes("magic")), ...DW2_MAGIC_ITEMS]
      : DW2_MAGIC_ITEMS.filter((item) => item.tags.includes(tag));
  const selected = useSignal(options[0]?.id ?? "");
  const pending =
    sheet.c.kind === "pc" && sheet.c.data[field] === true && sheet.c.data[claimedField] !== true;
  if (!pending) return null;
  return (
    <section className="form-section sheet-section" aria-label={title}>
      <h3 className="sheet-heading">{title}</h3>
      <label className="field">
        Choose an item
        <select
          value={selected.value}
          onChange={(event) => (selected.value = event.currentTarget.value)}
        >
          {options.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <Button
        variant="secondary"
        disabled={!sheet.editable || !selected.value}
        onClick={() => {
          const item = options.find((entry) => entry.id === selected.value);
          if (!item) return;
          addItem(sheet.campaign, sheet.c.id, item);
          setData(sheet.campaign, sheet.c.id, claimedField, true);
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
