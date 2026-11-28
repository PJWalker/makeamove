import type { ComponentType } from "react";
import type { ToolId } from "../scene/tools";
import {
  IconDraw,
  IconEffects,
  IconLight,
  IconMapPin,
  IconMeasure,
  IconObscure,
  IconPan,
  IconPing,
  IconSelect,
  IconShapes,
  IconText,
  IconWall,
} from "../ui/icons";
import type { IconProps as IconProperties } from "../ui/icons";

/** The canvas tools, as the toolbar and the command palette list them. */
const TOOLS: {
  id: ToolId;
  label: string;
  key: string;
  Icon: ComponentType<IconProperties>;
  gmOnly?: boolean;
}[] = [
  { id: "select", label: "Select", key: "V", Icon: IconSelect },
  { id: "pan", label: "Pan", key: "H", Icon: IconPan },
  { id: "draw", label: "Draw", key: "P", Icon: IconDraw },
  { id: "shape", label: "Shapes", key: "R", Icon: IconShapes },
  { id: "text", label: "Text", key: "X", Icon: IconText },
  { id: "ruler", label: "Measure", key: "M", Icon: IconMeasure },
  { id: "ping", label: "Ping", key: "G", Icon: IconPing },
  { id: "pin", label: "Pins", key: "N", Icon: IconMapPin },
  { id: "wall", label: "Walls", key: "W", Icon: IconWall, gmOnly: true },
  { id: "light", label: "Lights", key: "L", Icon: IconLight, gmOnly: true },
  { id: "effect", label: "Effects", key: "F", Icon: IconEffects, gmOnly: true },
  { id: "fog", label: "Fog of War", key: "O", Icon: IconObscure, gmOnly: true },
];

export default TOOLS;
