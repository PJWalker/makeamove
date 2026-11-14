import { morphOpen } from "../ui/morph";
import { raisePopup } from "../ui/popup";
import { hideTooltip } from "../ui/tooltipController";
import { entityTabId } from "./entityWindowState";
import { locate } from "./layoutModel";
import { useQuery } from "../ui/useQuery";
import { useCampaign } from "./campaignContext";

/** Which entries have windows open, and how to open one from its row. */
export function useEntryWindows() {
  const ctx = useCampaign();
  return {
    keys: useQuery(ctx.windows.openEntries),
    /** Open the window for `key`, morphing it out of the row's tooltip (or the row). */
    show(key: string, row: Element) {
      const id = entityTabId(`entry:${key}`);
      if (locate(ctx.panels.layout.value, id) !== "closed") {
        ctx.panels.showPanel(id);
        return;
      }
      const already = document.querySelector<HTMLElement>(
        `dialog[data-window-id="${CSS.escape(id)}"]`,
      );
      if (already) return raisePopup(already);
      const tip = document.querySelector(".tooltip:popover-open");
      morphOpen(tip ?? row, () => {
        hideTooltip();
        ctx.windows.openEntries.set([...new Set([...ctx.windows.openEntries.value, key])]);
      });
    },
    close(key: string) {
      ctx.windows.close(entityTabId(`entry:${key}`));
    },
  };
}
