import type { Icon } from "./icons";

/*
 * Rendered icons: full-colour objects from the adventurer's kit, modelled
 * and lit in scripts/icons and rendered by `npm run generate:icons` at 32px,
 * with a 64px render for high-density screens.
 */

const RENDERS = import.meta.glob<string>("./icon-art/*.png", {
  eager: true,
  query: "?url",
  import: "default",
});

function render(name: string, size: 32 | 64): string {
  const url = RENDERS[`./icon-art/${name}-${size}.png`];
  if (!url) throw new Error(`The ${name} icon has no ${size}px render; run npm run generate:icons`);
  return url;
}

export function art(name: string): Icon {
  const src = render(name, 32);
  const srcSet = `${render(name, 64)} 2x`;
  return function ArtIcon({ size = 22, className }) {
    return (
      <img
        className={className ? `icon-art ${className}` : "icon-art"}
        src={src}
        srcSet={srcSet}
        width={size}
        height={size}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
    );
  };
}
