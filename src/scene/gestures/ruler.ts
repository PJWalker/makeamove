import type { ToolPress } from "./types";

/** The Ruler: measures from the press to the pointer, shown to everyone while it's held. */
export const ruler: ToolPress = (c, _e, start) => {
  c.presence?.setRuler({ a: start, b: start });
  const clear = () => c.presence?.setRuler(null);
  return {
    kind: "ruler",
    move: (_e, world) => c.presence?.setRuler({ a: start, b: world }),
    end: clear,
    cancel: clear,
  };
};
