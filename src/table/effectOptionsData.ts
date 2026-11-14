import { createElement } from "react";
import { EFFECTS, type EffectKind } from "../scene/types";
import { IconEmbers, IconFog, IconMagic, IconRain, IconSnow, type Icon } from "../ui/icons";

const EFFECT_ICONS: Record<EffectKind, Icon> = {
  rain: IconRain,
  snow: IconSnow,
  fog: IconFog,
  embers: IconEmbers,
  magic: IconMagic,
};

/** The effects a zone can have, as Segmented options with their icons. */
export const EFFECT_OPTIONS = EFFECTS.map(({ id, label }) => ({
  id,
  label,
  icon: createElement(EFFECT_ICONS[id], { size: 20 }),
}));
