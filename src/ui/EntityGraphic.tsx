import type { EntityGraphic } from "../graphics";
import { BlobImage } from "./BlobImage";
import { entryIcon } from "./entryIcons";

export function EntityGraphicView({
  graphic,
  size = 22,
  class: className,
}: {
  graphic?: EntityGraphic;
  size?: number;
  class?: string;
}) {
  const shown = graphic ?? { kind: "icon", name: "bag" as const };
  const classes = ["entity-graphic", className].filter(Boolean).join(" ");
  if (shown.kind === "image") {
    const Fallback = entryIcon("item", "bag");
    return (
      <span
        class={classes}
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <BlobImage
          image={shown.image}
          class="entity-graphic-image"
          fallback={<Fallback size={size} />}
        />
      </span>
    );
  }
  const Icon = entryIcon("item", shown.name);
  return (
    <span
      class={classes}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Icon size={size} />
    </span>
  );
}
