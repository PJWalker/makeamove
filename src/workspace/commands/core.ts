import { isNothing, objectOf, oneOf } from "../../data/guards";
import type { ToolId } from "../../scene/tools";
import {
  IconFit,
  IconHelp,
  IconLeave,
  IconRedo,
  IconRelationships,
  IconSettings,
  IconSidebarHide,
  IconUndo,
} from "../../ui/icons";
import { goToCampaign } from "../../navigation/router";
import { autohide, setAutohide } from "../autohide";
import { PANEL_ORDER, PANELS } from "../panelLayout";
import type { PanelId } from "../layoutModel";
import { TOOLS } from "../tools";
import { command, type TableCommand } from "./types";

/* What every campaign has: tools, undo, the view, dialogs and panels. */

const isTool = oneOf(...TOOLS.map((t) => t.id)) as (v: unknown) => v is ToolId;

export const selectTool = command<{ tool: ToolId }>({
  id: "tool.select",
  params: objectOf({ tool: isTool }),
  kind: "tool",
  title: (_, { tool }) => TOOLS.find((t) => t.id === tool)?.label ?? "Tool",
  permission: (ctx, { tool }) =>
    !TOOLS.find((t) => t.id === tool)?.gmOnly || ctx.isGm() || "GM only",
  transact: false,
  offers: () => TOOLS.map((t) => ({ params: { tool: t.id }, icon: t.Icon, keys: [t.key] })),
  run: (ctx, { tool }) => ctx.tools.activeTool.set(tool),
});

export const undo = command({
  id: "history.undo",
  params: isNothing,
  title: "Undo",
  keys: ["Mod+Z"],
  icon: IconUndo,
  transact: false,
  available: (ctx) => ctx.history.canUndo.value || "Nothing to undo",
  offers: () => [{ params: undefined }],
  section: "arrange",
  menu: { canvas: () => [{ params: undefined }] },
  run: (ctx) => {
    ctx.canvas.canvasCommands.value?.controller.cancelGesture();
    ctx.history.undo();
  },
});

export const redo = command({
  id: "history.redo",
  params: isNothing,
  title: "Redo",
  keys: ["Shift+Mod+Z", "Mod+Y"],
  icon: IconRedo,
  transact: false,
  available: (ctx) => ctx.history.canRedo.value || "Nothing to redo",
  offers: () => [{ params: undefined }],
  section: "arrange",
  menu: { canvas: () => [{ params: undefined }] },
  run: (ctx) => {
    ctx.canvas.canvasCommands.value?.controller.cancelGesture();
    ctx.history.redo();
  },
});

export const fitToScene = command({
  id: "view.fit",
  params: isNothing,
  title: "Fit to Scene",
  aliases: ["zoom to fit", "reset view"],
  keys: ["Shift+1"],
  icon: IconFit,
  transact: false,
  available: (ctx) => !!ctx.canvas.canvasCommands.value || "Open a scene first",
  offers: () => [{ params: undefined }],
  section: "arrange",
  menu: { canvas: () => [{ params: undefined }] },
  run: (ctx) => ctx.canvas.canvasCommands.value?.controller.fit(),
});

export const toggleAutohide = command({
  id: "view.autohide",
  params: isNothing,
  title: "Autohide Sidebars and Toolbars",
  aliases: ["autohide", "auto-hide", "hide the interface", "toggle ui"],
  keys: ["Mod+\\"],
  icon: IconSidebarHide,
  transact: false,
  checked: () => autohide.value,
  offers: () => [{ params: undefined }],
  run: () => setAutohide(!autohide.value),
});

const dialog = (
  which: "settings" | "help" | "relationships",
  look: Pick<TableCommand, "title" | "icon" | "aliases" | "kind">,
) =>
  command({
    id: `dialog.${which}`,
    params: isNothing,
    transact: false,
    section: "open",
    ...look,
    offers: () => [{ params: undefined }],
    menu: { campaign: () => [{ params: undefined }] },
    run: (ctx) => ctx.canvas.dialogRequest.set(which),
  });

export const openSettings = dialog("settings", {
  title: "Settings…",
  kind: "setting",
  aliases: ["player settings", "campaign settings", "name", "colour", "autohide", "invite link"],
  icon: IconSettings,
});
export const openRelationships = dialog("relationships", {
  title: "Show Relationships…",
  aliases: ["web", "relationships"],
  icon: IconRelationships,
});
export const openHelp = dialog("help", {
  title: "Help and Shortcuts…",
  kind: "setting",
  icon: IconHelp,
});

const isPanel = oneOf(...PANEL_ORDER);

export const showPanel = command<{ panel: PanelId }>({
  id: "panel.show",
  params: objectOf({ panel: isPanel }),
  title: (_, { panel }) => `Show ${PANELS[panel].label}`,
  transact: false,
  available: (ctx, { panel }) =>
    !ctx.panels.unavailablePanels.value.includes(panel) || "Not in this campaign",
  offers: (ctx) =>
    PANEL_ORDER.filter((id) => !ctx.panels.unavailablePanels.value.includes(id)).map((id) => ({
      params: { panel: id },
      aliases: [PANELS[id].label],
      icon: PANELS[id].Icon,
    })),
  run: (ctx, { panel }) => ctx.panels.showPanel(panel),
});

/** Whether the table has a panel at all: ticked ones are in a sidebar or a window. */
export const togglePanel = command<{ panel: PanelId }>({
  id: "panel.toggle",
  params: objectOf({ panel: isPanel }),
  title: (_, { panel }) => PANELS[panel].label,
  transact: false,
  section: "arrange",
  checked: (ctx, { panel }) => !ctx.panels.layout.value.closed.includes(panel),
  menu: {
    campaign: (ctx) =>
      PANEL_ORDER.filter((id) => !ctx.panels.unavailablePanels.value.includes(id)).map((id) => ({
        params: { panel: id },
        icon: PANELS[id].Icon,
      })),
  },
  run: (ctx, { panel }) =>
    ctx.panels.setPanelClosed(panel, !ctx.panels.layout.value.closed.includes(panel)),
});

export const leaveCampaign = command({
  id: "campaign.leave",
  params: isNothing,
  title: "Back to Campaigns",
  icon: IconLeave,
  transact: false,
  section: "delete",
  menu: { campaign: () => [{ params: undefined }] },
  run: () => goToCampaign(null),
});

export const togglePalette = command({
  id: "palette.toggle",
  params: isNothing,
  title: "Command Palette",
  keys: ["Mod+K"],
  transact: false,
  run: (ctx) => ctx.table.togglePalette(),
});

export const coreCommands = [
  togglePalette,
  selectTool,
  undo,
  redo,
  fitToScene,
  toggleAutohide,
  openSettings,
  openRelationships,
  openHelp,
  showPanel,
  togglePanel,
  leaveCampaign,
];
