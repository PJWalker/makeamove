import { createPaneLayout } from "../ui/TwoPane";

export const charactersLayout = createPaneLayout("charsList", {
  list: "list",
  detail: "sheet",
});
export const notesLayout = createPaneLayout("notesList", {
  list: "list",
  detail: "page",
});
export const referenceLayout = createPaneLayout("referenceList", {
  list: "entries",
  detail: "entry",
});
export const scenesLayout = createPaneLayout("scenesList", {
  list: "scenes",
  detail: "settings",
});
