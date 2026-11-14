import type { ReactNode } from "react";
import type { RollVisibility } from "../features/chat/types";
import { pickName, samePick, signed, type TrayPick } from "../features/dice/pool";
import { Button } from "../ui/Button";
import { POOL_MS, type useDicePool } from "./useDicePool";

const VISIBILITIES: { id: RollVisibility; label: string; title: string }[] = [
  { id: "public", label: "Public", title: "Everyone sees the roll" },
  {
    id: "private",
    label: "Secret",
    title: "Only you and the GM see the result",
  },
];
const DICE: TrayPick[] = [4, 6, 8, 10, 12, 20].map((sides) => ({ kind: "die", sides }));
const TOKENS: TrayPick[] = [
  { kind: "modifier", value: 1 },
  { kind: "modifier", value: -1 },
];

/** What a quick-dice button says to a screen reader: what a click does, and how to take one back. */
function pickLabel(pick: TrayPick, name: string, count: number) {
  if (count) return `Add another ${name} (${count} so far; right-click to remove one)`;
  const what = pick.kind === "stat" ? `${name} (${signed(pick.value)})` : name;
  return `${pick.kind === "die" ? "Roll a" : "Add"} ${what} (click again for more, or drag onto a roll to add it)`;
}

/** The quick dice bar: a button for each die, modifier and stat, and who sees the roll. */
export function QuickDice({
  dice,
  stats,
  visibility,
  onVisibility,
}: {
  dice: ReturnType<typeof useDicePool>;
  stats: TrayPick[];
  visibility: RollVisibility;
  onVisibility: (visibility: RollVisibility) => void;
}) {
  const { pool, dragged } = dice;
  const vis = VISIBILITIES.find((v) => v.id === visibility) ?? VISIBILITIES[0]!;
  const nextVisibility = () => {
    const options = VISIBILITIES.map((v) => v.id);
    onVisibility(options[(options.indexOf(visibility) + 1) % options.length]!);
  };

  const pickButton = (pick: TrayPick): ReactNode => {
    const name = pickName(pick);
    const count = pool.filter((picked) => samePick(picked, pick)).length;
    return (
      <Button
        key={name}
        variant="secondary"
        className="dice-pick"
        data-count={count || undefined}
        label={pickLabel(pick, name, count)}
        onPointerDown={(event) => dice.dragOut(event, pick)}
        onClick={() => {
          // The click that ends a drag out of the button isn't a pick.
          if (dragged.current) dragged.current = false;
          else dice.addPick(pick);
        }}
        onContextMenu={(e) => {
          if (!pool.length) return;
          e.preventDefault();
          dice.removePick(pick);
        }}
      >
        {name}
      </Button>
    );
  };

  return (
    <>
      {pool.length > 0 && (
        <span
          key={`progress:${pool.map((pick, index) => `${index}:${pickName(pick)}`).join("|")}`}
          className="dice-pool-progress"
          style={{ "--pool-ms": `${POOL_MS}ms` }}
          aria-hidden="true"
        />
      )}
      <div className="dice-quick">
        <div className="tray-row">
          {DICE.map(pickButton)}
          <Button
            variant="ghost"
            className="dice-visibility"
            label={vis.title}
            onClick={nextVisibility}
          >
            {vis.label}
          </Button>
        </div>
        <div className="tray-row tray-chips">
          {TOKENS.map(pickButton)}
          {stats.length > 0 && <span className="tray-divider" aria-hidden="true" />}
          {stats.map(pickButton)}
        </div>
      </div>
    </>
  );
}
