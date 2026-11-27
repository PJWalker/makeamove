import type { ReactNode } from "react";
import type { Grid } from "../scene/grid";
import type { ElementPatch } from "../scene/sceneDoc";
import type { LightElement, WallElement } from "../scene/types";
import Button from "../ui/Button";
import CommitInput from "../ui/CommitInput";
import { IconLight } from "../ui/icons";
import { Segmented } from "../ui/Segmented";

/* The selection bar's fields for the GM's walls and lamps, which decide what can be seen. */

/** Light radii show to a tenth of a grid unit. */
const TENTHS = 10;

/** A wall's fields: whether it's a door, and whether the door is open. */
export function wallFields(
  sel: readonly WallElement[],
  set: (patch: ElementPatch) => void,
): ReactNode[] {
  const fields: ReactNode[] = [];
  const doors = sel.every((w) => w.door);
  fields.push(
    <Segmented
      key="door"
      label="Wall or Door"
      value={doors ? "door" : "wall"}
      options={[
        { id: "wall", label: "Wall" },
        { id: "door", label: "Door" },
      ]}
      onChange={(kind) => {
        set(kind === "door" ? { door: true, open: false } : { door: false });
      }}
    />,
  );
  if (doors)
    fields.push(
      <Segmented
        key="open"
        label="Door"
        value={sel.every((w) => w.open) ? "open" : "closed"}
        options={[
          { id: "closed", label: "Closed" },
          { id: "open", label: "Open" },
        ]}
        onChange={(state) => {
          set({ open: state === "open" });
        }}
      />,
    );
  return fields;
}

/** A lamp's fields: how far its bright and dim light reach, in the grid's units, and whether it flickers. */
export function lightFields(
  sel: readonly LightElement[],
  grid: Grid,
  set: (patch: ElementPatch) => void,
): ReactNode[] {
  const fields: ReactNode[] = [];
  const l = sel[0]!;
  // Radii in the grid's units: bright out to one, dim out to the other.
  const toUnits = (px: number) =>
    String(Math.round((px / grid.size) * grid.unit * TENTHS) / TENTHS);
  const toPx = (units: string) => (Number(units) / (grid.unit || 1)) * grid.size;
  const radius = (key: "bright" | "dim", label: string) => (
    <label key={key} className="selection-bar-number">
      {label}
      <CommitInput
        type="number"
        min={0}
        step={grid.unit || 1}
        aria-label={`${label} (${grid.unitName})`}
        value={toUnits(l[key])}
        onCommit={(v) => {
          const px = toPx(v);
          if (!Number.isFinite(px) || px < 0) return;
          // Dim light reaches at least as far as bright.
          set(
            key === "bright"
              ? { bright: px, dim: Math.max(px, l.dim) }
              : { dim: px, bright: Math.min(px, l.bright) },
          );
        }}
      />
      <span className="muted">{grid.unitName}</span>
    </label>
  );
  fields.push(
    radius("bright", "Bright"),
    radius("dim", "Dim"),
    <Button
      key="flicker"
      variant="icon"
      icon={IconLight}
      label="Flicker"
      pressed={sel.every((x) => x.flicker)}
      onClick={() => {
        set({ flicker: sel.every((x) => x.flicker) ? undefined : true });
      }}
    />,
  );
  return fields;
}
