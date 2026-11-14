import type { EffectSight } from "../scene/types";
import { ToggleGroup } from "../ui/Segmented";
import { IconLight, IconObscure } from "../ui/icons";

type SightFlag = keyof EffectSight;

const SIGHT_FLAGS = ["glow", "obscures"] as const;

/** Whether an effect gives off light and whether it blocks sight, as two toggles; a change gives just the flag toggled. */
export function EffectSightToggles({
  value,
  onChange,
}: {
  value: Required<EffectSight>;
  onChange: (patch: Partial<Record<SightFlag, boolean>>) => void;
}) {
  const on = SIGHT_FLAGS.filter((k) => value[k]);
  return (
    <ToggleGroup<SightFlag>
      label="Light and Sight"
      value={on}
      options={[
        { id: "glow", label: "Gives Light", icon: <IconLight size={20} /> },
        { id: "obscures", label: "Blocks Sight", icon: <IconObscure size={20} /> },
      ]}
      onChange={(next) => {
        const nextFlags = new Set(next);
        const changed = SIGHT_FLAGS.filter((k) => nextFlags.has(k) !== value[k]);
        onChange(Object.fromEntries(changed.map((k) => [k, nextFlags.has(k)])));
      }}
    />
  );
}
