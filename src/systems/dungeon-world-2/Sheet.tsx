import {
  SheetFrame,
  SheetSectionView,
  useSheet,
  type SheetProps,
} from "../../table/DeclarativeSheet";

export function DungeonWorld2Sheet(props: SheetProps) {
  const sheet = useSheet(props);
  return (
    <SheetFrame {...sheet}>
      <SheetSectionView {...sheet} section={{ kind: "header" }} />
      <SheetSectionView
        {...sheet}
        section={{ kind: "choices", choices: ["class"] }}
      />
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
      <SheetSectionView
        {...sheet}
        section={{ kind: "actions", label: "Moves" }}
      />
      <SheetSectionView {...sheet} section={{ kind: "inventory" }} />
      <SheetSectionView
        {...sheet}
        section={{
          kind: "text",
          label: "Origins",
          fields: [
            { field: "ancestry", label: "Ancestry" },
            { field: "community", label: "Community" },
            { field: "background", label: "Background" },
          ],
        }}
      />
    </SheetFrame>
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
          fields: ["damage", "tags", "instinct", "moves"],
        }}
      />
      <SheetSectionView {...sheet} section={{ kind: "inventory" }} />
    </SheetFrame>
  );
}
