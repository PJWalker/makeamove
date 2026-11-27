import type { SelectKind } from "../scene/tools";
import {
  IconDraw,
  IconEffects,
  IconLight,
  IconMap,
  IconShapes,
  IconText,
  IconToken,
  IconWall,
} from "../ui/icons";
import type { Icon } from "../ui/icons";

/** The sorts of things on a scene, each with the icon of the tool that makes it. */
const SELECT_KINDS: { id: SelectKind; label: string; Icon: Icon; gmOnly?: boolean }[] = [
  { id: "token", label: "Tokens", Icon: IconToken },
  { id: "map", label: "Maps", Icon: IconMap },
  { id: "drawing", label: "Drawings", Icon: IconDraw },
  { id: "shape", label: "Shapes", Icon: IconShapes },
  { id: "text", label: "Text", Icon: IconText },
  { id: "wall", label: "Walls", Icon: IconWall, gmOnly: true },
  { id: "light", label: "Lights", Icon: IconLight, gmOnly: true },
  { id: "effect", label: "Effects", Icon: IconEffects, gmOnly: true },
];

export default SELECT_KINDS;
