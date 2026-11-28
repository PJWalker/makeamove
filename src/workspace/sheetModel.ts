import { canEdit } from "../features/characters/api";
import { derive } from "../features/characters/store";
import type { SheetProps as SheetProperties } from "../systems/extensionTypes";

function useSheet(properties: SheetProperties) {
  return {
    ...properties,
    d: derive(properties.c, properties.system),
    editable: canEdit(properties.campaign, properties.c),
  };
}

export default useSheet;
