import { callKey } from "../../kernel/commands";
import type { MenuItem } from "../../ui/ContextMenu";
import type { CampaignContext } from "../campaignContext";
import { platformCombo, shortcutFor, showCombo } from "./custom";
import {
  MENU_SECTIONS,
  type Action,
  type AnyTableCommand,
  type MenuSection,
  type Offer,
  type TableCommand,
  type Target,
} from "./types";

/*
 * Views over the command registry: what the palette and hotbar list, and
 * what each object's context menu holds. Nothing here decides what can be
 * done; the commands do.
 */

/** The table's commands. Everything registered on a table's context is one. */
const commands = (ctx: CampaignContext) => ctx.commands.all() as AnyTableCommand[];

const shown = <T>(
  v: T | ((ctx: CampaignContext, params: unknown) => T),
  ctx: CampaignContext,
  p: unknown,
): T => (typeof v === "function" ? (v as (ctx: CampaignContext, params: unknown) => T)(ctx, p) : v);

/** Run a call from a view, asking first if its command wants confirming. */
export function invoke(ctx: CampaignContext, command: AnyTableCommand, params: unknown) {
  const confirmation = command.confirm?.(ctx, params);
  if (confirmation) ctx.table.confirm(confirmation, () => ctx.execute(command, params));
  else ctx.execute(command, params);
}

/** A call as views show it. */
export function actionFor(
  ctx: CampaignContext,
  command: AnyTableCommand,
  offer: Offer<unknown>,
): Action {
  const { params } = offer;
  const detail = offer.detail ?? (command.detail && shown(command.detail, ctx, params));
  const aliases = [...(command.aliases ?? []), ...(offer.aliases ?? [])];
  const id = callKey(command.id, params);
  const keys = (offer.keys ?? command.keys ?? []).map((k) => platformCombo(k));
  const own = shortcutFor(ctx.campaign, id);
  const hint = own ? showCombo(own) : keys[0] && showCombo(keys[0]);
  return {
    id,
    command,
    params,
    kind: command.kind ?? "command",
    title: offer.title ?? shown(command.title, ctx, params),
    source: command.source ? shown(command.source, ctx, params) : "Core",
    available: ctx.commands.check(command, params),
    run: () => invoke(ctx, command, params),
    ...(offer.group ? { group: offer.group } : {}),
    ...(aliases.length ? { aliases } : {}),
    ...(offer.tags ? { tags: offer.tags } : {}),
    ...(detail ? { detail } : {}),
    ...(keys.length ? { keys } : {}),
    ...(hint ? { hint } : {}),
    ...((offer.icon ?? command.icon) ? { icon: offer.icon ?? command.icon } : {}),
    ...(command.danger ? { danger: true } : {}),
    ...(command.checked ? { checked: command.checked(ctx, params) } : {}),
    ...(offer.mine ? { mine: true } : {}),
    ...(offer.open ? { open: offer.open } : {}),
  };
}

/** Calls the player may not run at all are left out of views. */
const permitted = (ctx: CampaignContext, command: AnyTableCommand, params: unknown) =>
  ctx.commands.permits(command, params) === true;

/** Every call the palette lists, in the order commands were registered. */
export function listActions(ctx: CampaignContext): Action[] {
  const seen = new Set<string>();
  const out: Action[] = [];
  for (const command of commands(ctx)) {
    for (const offer of command.offers?.(ctx) ?? []) {
      if (!permitted(ctx, command, offer.params)) continue;
      const action = actionFor(ctx, command, offer);
      if (seen.has(action.id)) continue;
      seen.add(action.id);
      out.push(action);
    }
  }
  return out;
}

/**
 * A stored call (from the hotbar or a shortcut) by its key, as the palette
 * would show it if it lists it.
 */
export function findAction(ctx: CampaignContext, key: string): Action | undefined {
  const call = ctx.commands.resolve(key);
  if (!call) return undefined;
  const command = call.command as AnyTableCommand;
  const offer =
    command.offers?.(ctx).find((o) => callKey(command.id, o.params) === key) ??
    ({ params: call.params } satisfies Offer<unknown>);
  return actionFor(ctx, command, offer);
}

/**
 * The context menu for an object: every call any command offers for it, by
 * section with dividers between. Calls the player may not run are left out;
 * ones that can't run now are dimmed.
 */
export function menuFor(ctx: CampaignContext, target: Target): MenuItem[] {
  const sections = new Map<MenuSection, MenuItem[]>();
  for (const command of commands(ctx)) {
    const offers = command.menu?.[target.kind] as
      | ((ctx: CampaignContext, target: Target) => Offer<unknown>[])
      | undefined;
    for (const offer of offers?.(ctx, target) ?? []) {
      if (!permitted(ctx, command, offer.params)) continue;
      const a = actionFor(ctx, command, offer);
      const section = command.section ?? "act";
      const list = sections.get(section) ?? [];
      sections.set(section, list);
      list.push({
        label: a.title,
        onSelect: a.run,
        ...(a.icon ? { Icon: a.icon } : {}),
        ...(a.hint ? { shortcut: a.hint } : {}),
        ...(a.danger ? { danger: true } : {}),
        ...(a.available !== true ? { disabled: true } : {}),
        ...(a.checked !== undefined ? { checked: a.checked } : {}),
      });
    }
  }
  return joinSections(MENU_SECTIONS.map((s) => sections.get(s) ?? []));
}

/** Menu sections in order, with a divider between each non-empty one. */
export function joinSections(sections: MenuItem[][]): MenuItem[] {
  return sections
    .filter((s) => s.length)
    .flatMap((s, i): MenuItem[] => (i ? ["divider", ...s] : s));
}

/** Whether the player may run a call at all: what components ask instead of checking roles. */
export const can = <P>(ctx: CampaignContext, command: TableCommand<P, unknown>, params: P) =>
  ctx.commands.permits(command, params) === true;
