import { isNothing, objectOf, oneOf } from "../../lib/guards";
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
import type { CampaignContext } from "../campaignContext";
import TOOLS from "../tools";
import { command } from "./types";
import type { TableCommand } from "./types";

/* What every campaign has: tools, undo, the view, dialogs and panels. */

const isTool = oneOf(...TOOLS.map((t) => t.id)) as (v: unknown) => v is ToolId;

export const selectTool = command<{ tool: ToolId }>({
  id: "tool.select",
  params: objectOf({ tool: isTool }),
  kind: "tool",
  title: (_, { tool }) => TOOLS.find((t) => t.id === tool)?.label ?? "Tool",
  permission: (context, { tool }) =>
    !TOOLS.find((t) => t.id === tool)?.gmOnly || context.isGm() || "GM only",
  transact: false,
  offers: () => TOOLS.map((t) => ({ params: { tool: t.id }, icon: t.Icon, keys: [t.key] })),
  run: (context, { tool }) => {
    context.tools.activeTool.set(tool);
  },
});

/** Undo or Redo: a gesture under way is dropped first, so it doesn't land on the restored state. */
const historyCommand = (
  step: "redo" | "undo",
  look: Pick<TableCommand, "icon" | "keys" | "title">,
) =>
  command({
    id: `history.${step}`,
    params: isNothing,
    ...look,
    transact: false,
    available: (context) =>
      (step === "undo" ? context.history.canUndo.value : context.history.canRedo.value) ||
      `Nothing to ${step}`,
    offers: () => [{ params: undefined }],
    section: "arrange",
    menu: { canvas: () => [{ params: undefined }] },
    run: (context) => {
      context.canvas.canvasCommands.value?.controller.cancelGesture();
      context.history[step]();
    },
  });

export const undo = historyCommand("undo", { title: "Undo", keys: ["Mod+Z"], icon: IconUndo });
export const redo = historyCommand("redo", {
  title: "Redo",
  keys: ["Shift+Mod+Z", "Mod+Y"],
  icon: IconRedo,
});

export const fitToScene = command({
  id: "view.fit",
  params: isNothing,
  title: "Fit to Scene",
  aliases: ["zoom to fit", "reset view"],
  keys: ["Shift+1"],
  icon: IconFit,
  transact: false,
  available: (context) => !!context.canvas.canvasCommands.value || "Open a scene first",
  offers: () => [{ params: undefined }],
  section: "arrange",
  menu: { canvas: () => [{ params: undefined }] },
  run: (context) => context.canvas.canvasCommands.value?.controller.fit(),
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
  run: () => {
    setAutohide(!autohide.value);
  },
});

const dialog = (
  which: "help" | "relationships" | "settings",
  look: Pick<TableCommand, "aliases" | "icon" | "kind" | "title">,
) =>
  command({
    id: `dialog.${which}`,
    params: isNothing,
    transact: false,
    section: "open",
    ...look,
    offers: () => [{ params: undefined }],
    menu: { campaign: () => [{ params: undefined }] },
    run: (context) => {
      context.canvas.dialogRequest.set(which);
    },
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
/** The panels this campaign has, in order. */
const campaignPanels = (context: CampaignContext) =>
  PANEL_ORDER.filter((id) => !context.panels.unavailablePanels.value.includes(id));

export const showPanel = command<{ panel: PanelId }>({
  id: "panel.show",
  params: objectOf({ panel: isPanel }),
  title: (_, { panel }) => `Show ${PANELS[panel].label}`,
  transact: false,
  available: (context, { panel }) =>
    !context.panels.unavailablePanels.value.includes(panel) || "Not in this campaign",
  offers: (context) =>
    campaignPanels(context).map((id) => ({
      params: { panel: id },
      aliases: [PANELS[id].label],
      icon: PANELS[id].Icon,
    })),
  run: (context, { panel }) => {
    context.panels.showPanel(panel);
  },
});

/** Whether the table has a panel at all: ticked ones are in a sidebar or a window. */
export const togglePanel = command<{ panel: PanelId }>({
  id: "panel.toggle",
  params: objectOf({ panel: isPanel }),
  title: (_, { panel }) => PANELS[panel].label,
  transact: false,
  section: "arrange",
  checked: (context, { panel }) => !context.panels.layout.value.closed.includes(panel),
  menu: {
    campaign: (context) =>
      campaignPanels(context).map((id) => ({ params: { panel: id }, icon: PANELS[id].Icon })),
  },
  run: (context, { panel }) => {
    context.panels.setPanelClosed(panel, !context.panels.layout.value.closed.includes(panel));
  },
});

export const leaveCampaign = command({
  id: "campaign.leave",
  params: isNothing,
  title: "Back to Campaigns",
  icon: IconLeave,
  transact: false,
  section: "delete",
  menu: { campaign: () => [{ params: undefined }] },
  run: () => {
    goToCampaign(null);
  },
});

export const togglePalette = command({
  id: "palette.toggle",
  params: isNothing,
  title: "Command Palette",
  keys: ["Mod+K"],
  transact: false,
  run: (context) => {
    context.table.togglePalette();
  },
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
