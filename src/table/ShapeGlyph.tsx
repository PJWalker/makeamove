import type { IconProps } from "../ui/icons";
import type { ShapeKind } from "../scene/types";

/** The pictures' size, in px, unless asked for another. */
const GLYPH_SIZE = 18;

const SHAPE_PAINT = {
  fill: "currentColor",
  fillOpacity: 0.3,
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinejoin: "round",
} as const;

/**
 * A small picture of a shape for its button, in the segment's own ink so it
 * stands out whether chosen or not, whatever the shape's paint.
 */
function ShapeGlyph({ shape, size = GLYPH_SIZE, className }: IconProps & { shape: ShapeKind }) {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 18 18" aria-hidden="true">
      {shape === "rect" && <rect x="3" y="3" width="12" height="12" {...SHAPE_PAINT} />}
      {shape === "circle" && <circle cx="9" cy="9" r="6.5" {...SHAPE_PAINT} />}
      {shape === "line" && <rect x="1" y="7" width="16" height="4" {...SHAPE_PAINT} />}
      {shape === "cone" && <polygon points="2,9 16,2 16,16" {...SHAPE_PAINT} />}
      {shape === "polygon" && <polygon points="2,6 9,2 16,6 14,15 5,16" {...SHAPE_PAINT} />}
    </svg>
  );
}

export default ShapeGlyph;
