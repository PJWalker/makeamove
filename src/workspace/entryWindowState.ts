import { morphOpen } from "../ui/morph";
import { raisePopup } from "../ui/popup";
import { hideTooltip } from "../ui/tooltipController";
import { useQuery } from "../ui/useQuery";
import { entityTabId } from "./entityWindowState";
import { locate } from "./layoutModel";
import { useCampaign } from "./campaignContext";

/** Which entries have windows open, and how to open one from its row. */
function useEntryWindows() {
  const context = useCampaign();
  return {
    keys: useQuery(context.windows.openEntries),
    /** Open the window for `key`, morphing it out of the row's tooltip (or the row). */
    show(key: string, row: Element) {
      const id = entityTabId(`entry:${key}`);
      if (locate(context.panels.layout.value, id) !== "closed") {
        context.panels.showPanel(id);
        return;
      }
      const already = document.querySelector<HTMLElement>(
        `dialog[data-window-id="${CSS.escape(id)}"]`,
      );
      if (already) { raisePopup(already); return; }
      const tip = document.querySelector(".tooltip:popover-open");
      morphOpen(tip ?? row, () => {
        hideTooltip();
        context.windows.openEntries.set([...new Set([...context.windows.openEntries.value, key])]);
      });
    },
    close(key: string) {
      context.windows.close(entityTabId(`entry:${key}`));
    },
  };
}

export default useEntryWindows;
