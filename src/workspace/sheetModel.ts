import { canEdit } from "../features/characters/api";
import { derive } from "../features/characters/store";
import type { SheetProps } from "./DeclarativeSheet";

export function useSheet(props: SheetProps) {
  return { ...props, d: derive(props.c, props.system), editable: canEdit(props.campaign, props.c) };
}
