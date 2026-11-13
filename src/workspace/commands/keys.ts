import { useEffect } from "react";
import { isTyping } from "../../ui/keys";
import type { CampaignContext } from "../campaignContext";
import { actionForCombo, comboOf, firesWhileTyping, platformCombo, shortcuts } from "./custom";
import { findAction, invoke, listActions } from "./views";
import type { Action, AnyTableCommand } from "./types";

/** The shortcut recorder's class: keys pressed in it are being recorded, not run. */
export const RECORDER = "shortcut-recorder";

/*
 * Keyboard shortcuts, through the registry: the player's own first, then
 * the commands' built-in ones. Captured, so a built-in key a player has
 * bound to something else stays with what they bound it to.
 */

/** The call a combo runs: the player's own binding, else a command's built-in key. */
export function callForCombo(ctx: CampaignContext, combo: string): Action | undefined {
  const own = actionForCombo(shortcuts(ctx.campaign), combo);
  if (own) return findAction(ctx, own);
  const bound = (ctx.commands.all() as AnyTableCommand[]).find((c) =>
    c.keys?.some((k) => platformCombo(k) === combo),
  );
  if (bound) return findAction(ctx, bound.id);
  return listActions(ctx).find((a) => a.keys?.includes(combo));
}

export function useCommandKeys(ctx: CampaignContext) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as Element | null;
      if (e.repeat || target?.closest?.(`.${RECORDER}`)) return;
      const combo = comboOf(e);
      if (!combo) return;
      // Pop-ups are non-modal: keys aimed inside a dialog or field stay there.
      const typing = isTyping(e.target) || !!target?.closest?.("dialog");
      if (typing && !firesWhileTyping(combo)) return;
      const a = callForCombo(ctx, combo);
      if (a?.available !== true) return;
      e.preventDefault();
      e.stopPropagation();
      ctx.table.closePalette();
      ctx.recent.note(a.id);
      invoke(ctx, a.command, a.params);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [ctx]);
}
