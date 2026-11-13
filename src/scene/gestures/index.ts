import type { ToolId } from "../tools";
import { draw } from "./draw";
import { effect } from "./effect";
import { erase } from "./erase";
import { light } from "./light";
import { pan } from "./pan";
import { ping } from "./ping";
import { ruler } from "./ruler";
import { select } from "./select";
import { shape } from "./shape";
import { text } from "./text";
import { wall } from "./wall";
import type { ToolPress } from "./types";

/** What a press on the canvas does with each tool. */
export const TOOL_PRESS: Record<ToolId, ToolPress> = {
  select,
  pan,
  draw,
  erase,
  shape,
  text,
  ruler,
  ping,
  wall,
  light,
  effect,
};
