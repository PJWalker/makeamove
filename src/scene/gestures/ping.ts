import { coalesced, dragged, type ToolPress } from "./types";

/** The Ping: a click pings the map for everyone; a drag leaves a fading trail. */
export const ping: ToolPress = (c, _e, start) => {
  c.presence?.ping(start);
  let active = false;
  return {
    kind: "trail",
    move(e, world) {
      if (!active) {
        if (!dragged(c, start, world)) return;
        active = true;
        c.presence?.trailTo(start);
      }
      c.presence?.trailTo(...coalesced(c, e).map(([, p]) => p));
    },
    end: () => c.presence?.endTrail(),
    cancel: () => c.presence?.endTrail(),
  };
};
