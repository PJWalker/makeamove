import type { EntityGraphic } from "../media/images";
import { BlobImage } from "./BlobImage";
import { ENTRY_ICONS, type EntryIconName } from "./entryIcons";

const Fallback = ENTRY_ICONS.bag;

export function EntityGraphicView({
  graphic,
  size = 22,
  className,
}: {
  graphic?: EntityGraphic | undefined;
  size?: number;
  className?: string | undefined;
}) {
  const shown = graphic ?? { kind: "icon", name: "bag" as const };
  const classes = ["entity-graphic", className].filter(Boolean).join(" ");
  if (shown.kind === "image") {
    return (
      <span className={classes} style={{ width: size, height: size }} aria-hidden="true">
        <BlobImage
          image={shown.image}
          className="entity-graphic-image"
          fallback={<Fallback size={size} />}
        />
      </span>
    );
  }
  const Icon = ENTRY_ICONS[shown.name as EntryIconName] ?? Fallback;
  return (
    <span className={classes} style={{ width: size, height: size }} aria-hidden="true">
      <Icon size={size} />
    </span>
  );
}
