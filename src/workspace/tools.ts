import type { ComponentType } from "react";
import type { ToolId } from "../scene/tools";
import {
  IconDraw,
  IconEraser,
  IconLight,
  IconMeasure,
  IconPan,
  IconPing,
  IconSelect,
  IconShapes,
  IconText,
  IconWall,
  type IconProps,
} from "../ui/icons";

/** The canvas tools, as the toolbar and the command palette list them. */
export const TOOLS: {
  id: ToolId;
  label: string;
  key: string;
  Icon: ComponentType<IconProps>;
  gmOnly?: boolean;
}[] = [
  { id: "select", label: "Select", key: "V", Icon: IconSelect },
  { id: "pan", label: "Pan", key: "H", Icon: IconPan },
  { id: "draw", label: "Draw", key: "P", Icon: IconDraw },
  { id: "erase", label: "Erase", key: "E", Icon: IconEraser },
  { id: "shape", label: "Shapes", key: "R", Icon: IconShapes },
  { id: "text", label: "Text", key: "X", Icon: IconText },
  { id: "ruler", label: "Measure", key: "M", Icon: IconMeasure },
  { id: "ping", label: "Ping", key: "G", Icon: IconPing },
  { id: "wall", label: "Walls", key: "W", Icon: IconWall, gmOnly: true },
  { id: "light", label: "Lights", key: "L", Icon: IconLight, gmOnly: true },
];
