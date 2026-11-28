import type { EntityGraphic } from "../media/images";
import BlobImage from "./BlobImage";
import { ENTRY_ICONS } from "./entryIcons";
import type { EntryIconName } from "./entryIcons";

const Fallback = ENTRY_ICONS.bag;

function EntityGraphicView({
  graphic,
  size = 22,
  className,
}: {
  graphic?: EntityGraphic | undefined;
  size?: number;
  className?: string | undefined;
}) {
  const classes = ["entity-graphic", className].filter(Boolean).join(" ");
  let content;
  if (graphic?.kind === "image") {
    content = (
      <BlobImage
        image={graphic.image}
        className="entity-graphic-image"
        fallback={<Fallback size={size} />}
      />
    );
  } else {
    const Icon = ENTRY_ICONS[(graphic?.name ?? "bag") as EntryIconName] ?? Fallback;
    content = <Icon size={size} />;
  }
  return (
    <span className={classes} style={{ width: size, height: size }} aria-hidden="true">
      {content}
    </span>
  );
}

export default EntityGraphicView;
