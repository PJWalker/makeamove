import { createElement } from "react";
import type { ReactNode } from "react";
import { EFFECTS, SHAPES } from "../scene/types";
import type { EffectKind, FogForce } from "../scene/types";
import {
  IconEmbers,
  IconFog,
  IconMagic,
  IconObscure,
  IconRain,
  IconReveal,
  IconSnow,
} from "../ui/icons";
import type { Icon } from "../ui/icons";
import { ShapeGlyph } from "./ShapeGlyph";

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

/** What a fog of war shape does to what's in it, as Segmented options with their icons. */
export const FOG_FORCE_OPTIONS: { id: FogForce; label: string; icon: ReactNode }[] = [
  { id: "reveal", label: "Reveal", icon: createElement(IconReveal, { size: 20 }) },
  { id: "hide", label: "Hide", icon: createElement(IconObscure, { size: 20 }) },
];

/** The shapes, as Segmented options with their pictures. */
export const SHAPE_OPTIONS = SHAPES.map((s) => ({
  id: s.id,
  label: s.label,
  icon: createElement(ShapeGlyph, { shape: s.id }),
}));
