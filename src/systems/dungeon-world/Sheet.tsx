import {
  SheetFrame,
  SheetSectionView,
  useSheet,
  type SheetProps,
} from "../../table/DeclarativeSheet";

export function DungeonWorldSheet(props: SheetProps) {
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
            { label: "Coin", data: "coin" },
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
            { label: "Load", value: "load", max: "maxLoad" },
          ],
        }}
      />
      <SheetSectionView
        {...sheet}
        section={{ kind: "stats", label: "Abilities & debilities" }}
      />
      <SheetSectionView
        {...sheet}
        section={{ kind: "modifiers", label: "Situation" }}
      />
      <SheetSectionView
        {...sheet}
        section={{ kind: "actions", label: "Moves" }}
      />
      <SheetSectionView {...sheet} section={{ kind: "inventory" }} />
    </SheetFrame>
  );
}

export function DungeonWorldNpcSheet(props: SheetProps) {
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
          ],
        }}
      />
      <SheetSectionView {...sheet} section={{ kind: "npcFields" }} />
      <SheetSectionView {...sheet} section={{ kind: "inventory" }} />
      <SheetSectionView
        {...sheet}
        section={{ kind: "text", fields: [{ field: "notes", label: "Notes" }] }}
      />
    </SheetFrame>
  );
}
