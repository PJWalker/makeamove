import { callKey } from "../../kernel/commands";
import type { MenuItem } from "../../ui/ContextMenu";
import type { CampaignContext } from "../campaignContext";
import { platformCombo, shortcutFor, showCombo } from "./custom";
import { MENU_SECTIONS } from "./types";
import type { Action, AnyTableCommand, MenuSection, Offer, TableCommand, Target } from "./types";

/*
 * Views over the command registry: what the palette and hotbar list, and
 * what each object's context menu holds. Nothing here decides what can be
 * done; the commands do.
 */

/** The table's commands. Everything registered on a table's context is one. */
const commands = (context: CampaignContext) => context.commands.all() as AnyTableCommand[];

/** What a command shows (its title, source, detail) for a call: fixed, or worked out from it. */
export const shown = <T, P>(
  v: T | ((context: CampaignContext, parameters: P) => T),
  context: CampaignContext,
  p: P,
): T =>
  typeof v === "function" ? (v as (context_: CampaignContext, parameters: P) => T)(context, p) : v;

/** Run a call from a view, asking first if its command wants confirming. */
export function invoke(context: CampaignContext, command: AnyTableCommand, parameters: unknown) {
  const confirmation = command.confirm?.(context, parameters);
  if (confirmation) context.table.confirm(confirmation, () => context.execute(command, parameters));
  else context.execute(command, parameters);
}

/** A call as views show it. */
export function actionFor(
  context: CampaignContext,
  command: AnyTableCommand,
  offer: Offer<unknown>,
): Action {
  const { params } = offer;
  const detail = offer.detail ?? (command.detail && shown(command.detail, context, params));
  const aliases = [...(command.aliases ?? []), ...(offer.aliases ?? [])];
  const id = callKey(command.id, params);
  const keys = (offer.keys ?? command.keys ?? []).map((k) => platformCombo(k));
  const own = shortcutFor(context.campaign, id);
  const keyShown = keys[0] ?? (command.nativeKey && platformCombo(command.nativeKey));
  const hint = own ? showCombo(own) : keyShown && showCombo(keyShown);
  return {
    id,
    command,
    params,
    kind: command.kind ?? "command",
    title: offer.title ?? shown(command.title, context, params),
    source: command.source ? shown(command.source, context, params) : "Core",
    available: context.commands.check(command, params),
    run: () => {
      invoke(context, command, params);
    },
    ...(offer.group ? { group: offer.group } : {}),
    ...(aliases.length > 0 ? { aliases } : {}),
    ...(offer.tags ? { tags: offer.tags } : {}),
    ...(detail ? { detail } : {}),
    ...(keys.length > 0 ? { keys } : {}),
    ...(hint ? { hint } : {}),
    ...((offer.icon ?? command.icon) ? { icon: offer.icon ?? command.icon } : {}),
    ...(command.danger ? { danger: true } : {}),
    ...(command.checked ? { checked: command.checked(context, params) } : {}),
    ...(offer.mine ? { mine: true } : {}),
    ...(offer.open ? { open: offer.open } : {}),
  };
}

/** Calls the player may not run at all are left out of views. */
const permitted = (context: CampaignContext, command: AnyTableCommand, parameters: unknown) =>
  context.commands.permits(command, parameters) === true;

/** Every call the palette lists, in the order commands were registered. */
export function listActions(context: CampaignContext): Action[] {
  const seen = new Set<string>();
  const out: Action[] = [];
  for (const command of commands(context)) {
    for (const offer of command.offers?.(context) ?? []) {
      if (!permitted(context, command, offer.params)) continue;
      const action = actionFor(context, command, offer);
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
export function findAction(context: CampaignContext, key: string): Action | undefined {
  const call = context.commands.resolve(key);
  if (!call) return undefined;
  const command = call.command as AnyTableCommand;
  const offer =
    command.offers?.(context).find((o) => callKey(command.id, o.params) === key) ??
    ({ params: call.params } satisfies Offer<unknown>);
  return actionFor(context, command, offer);
}

/**
 * The context menu for an object: every call any command offers for it, by
 * section with dividers between. Calls the player may not run are left out;
 * ones that can't run now are dimmed.
 */
export function menuFor(context: CampaignContext, target: Target): MenuItem[] {
  const sections = new Map<MenuSection, MenuItem[]>();
  const submenus = new Map<string, MenuItem[]>();
  for (const command of commands(context)) {
    const offers = command.menu?.[target.kind] as
      | ((context_: CampaignContext, target: Target) => Offer<unknown>[])
      | undefined;
    for (const offer of offers?.(context, target) ?? []) {
      if (!permitted(context, command, offer.params)) continue;
      const a = actionFor(context, command, offer);
      const section = command.section ?? "act";
      const list = sections.get(section) ?? [];
      sections.set(section, list);
      const item: MenuItem = {
        label: a.title,
        onSelect: a.run,
        ...(a.icon ? { Icon: a.icon } : {}),
        ...(a.hint ? { shortcut: a.hint } : {}),
        ...(a.danger ? { danger: true } : {}),
        ...(a.available === true ? {} : { disabled: true }),
        ...(a.checked === undefined ? {} : { checked: a.checked }),
      };
      const { submenu } = command;
      if (!submenu) {
        list.push(item);
        continue;
      }
      // The submenu takes the place of the first command in it.
      let items = submenus.get(submenu.title);
      if (!items) {
        items = [];
        submenus.set(submenu.title, items);
        list.push({ label: submenu.title, Icon: submenu.icon, items });
      }
      items.push(item);
    }
  }
  return joinSections(MENU_SECTIONS.map((s) => sections.get(s) ?? []));
}

/** Menu sections in order, with a divider between each non-empty one. */
export function joinSections(sections: MenuItem[][]): MenuItem[] {
  const joined: MenuItem[] = [];
  for (const s of sections) {
    if (s.length === 0) continue;
    if (joined.length > 0) joined.push("divider");
    joined.push(...s);
  }
  return joined;
}

/** Whether the player may run a call at all: what components ask instead of checking roles. */
export const can = <P>(context: CampaignContext, command: TableCommand<P>, parameters: P) =>
  context.commands.permits(command, parameters) === true;
