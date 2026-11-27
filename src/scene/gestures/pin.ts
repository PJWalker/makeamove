import { moveSelection } from "./move";
import type { ToolPress } from "./types";

/**
 * The Pins tool: a press on a pin selects and moves it (a click opens it, as
 * with the Select tool), and anywhere else asks what a new pin there should
 * lead to.
 */
const pin: ToolPress = (c, _e, world) => {
  const under = c.hitTest(world);
  if (under?.type !== "pin") {
    c.onPinRequest?.({ at: world });
    return null;
  }
  if (!c.selection.value.includes(under.id)) c.selection.value = [under.id];
  return moveSelection(c, world);
};

export default pin;
