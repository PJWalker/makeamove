import type { Icon } from "./icons";

/*
 * Rendered library-entry icons: full-colour objects from the adventurer's
 * kit, modelled and lit in scripts/icons and rendered by
 * `npm run generate:icons` at 32px, with a 64px render for high-density
 * screens and a 128px one for tokens on the canvas.
 */

const RENDERS = import.meta.glob<string>("./icon-art/*.png", {
  eager: true,
  query: "?url",
  import: "default",
});

/** The URL of one of an icon's renders. */
export function artUrl(name: string, size: 32 | 64 | 128): string {
  const url = RENDERS[`./icon-art/${name}-${size}.png`];
  if (!url) throw new Error(`The ${name} icon has no ${size}px render; run npm run generate:icons`);
  return url;
}

export function art(name: string): Icon {
  const source = artUrl(name, 32);
  const sourceSet = `${artUrl(name, 64)} 2x`;
  return function ArtIcon({ size = 22, className }) {
    return (
      <img
        className={className ? `icon-art ${className}` : "icon-art"}
        src={source}
        srcSet={sourceSet}
        width={size}
        height={size}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
    );
  };
}
