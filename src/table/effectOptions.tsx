import { EFFECTS, type EffectKind, type EffectSight } from "../scene/types";
import { ToggleGroup } from "../ui/Segmented";
import {
  IconEmbers,
  IconFog,
  IconLight,
  IconMagic,
  IconObscure,
  IconRain,
  IconSnow,
  type Icon,
} from "../ui/icons";

const EFFECT_ICONS: Record<EffectKind, Icon> = {
  rain: IconRain,
  snow: IconSnow,
  fog: IconFog,
  embers: IconEmbers,
  magic: IconMagic,
};

/** The effects a zone can have, as Segmented options with their icons. */
export const EFFECT_OPTIONS = EFFECTS.map(({ id, label }) => {
  const Icon = EFFECT_ICONS[id];
  return { id, label, icon: <Icon size={20} /> };
});

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
