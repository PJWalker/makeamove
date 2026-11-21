import "react";

declare module "react" {
  interface CSSProperties {
    // An index signature, so this merges with React's own CSSProperties: a Record can't.
    // eslint-disable-next-line typescript/consistent-indexed-object-style
    [property: `--${string}`]: string | number | null | undefined;
  }
}
