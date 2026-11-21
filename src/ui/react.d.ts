import "react";

declare module "react" {
  // An index signature, so this merges with React's own CSSProperties: a Record can't.
  // eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
  interface CSSProperties {
    [property: `--${string}`]: string | number | null | undefined;
  }
}
