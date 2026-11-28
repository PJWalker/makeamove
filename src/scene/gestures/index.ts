import type { ToolId } from "../tools";
import draw from "./draw";
import effect from "./effect";
import light from "./light";
import { fog } from "./fog";
import { pan } from "./pan";
import pin from "./pin";
import ping from "./ping";
import ruler from "./ruler";
import { select } from "./select";
import { shape } from "./shape";
import { text } from "./text";
import { wall } from "./wall";
import type { ToolPress } from "./types";

/** What a press on the canvas does with each tool. */
const TOOL_PRESS: Record<ToolId, ToolPress> = {
  select,
  pan,
  draw,
  shape,
  text,
  ruler,
  ping,
  wall,
  light,
  effect,
  fog,
  pin,
};

export default TOOL_PRESS;
