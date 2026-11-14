import type { AnyCommand, Availability, Command } from "../../kernel/commands";
import type { ChatContent } from "../../features/chat/content";
import type { Icon } from "../../ui/icons";
import type { Confirmation } from "../tableState";
import type { CampaignContext } from "../campaignContext";

/*
 * The table's commands: a kernel command (kernel/commands.ts) plus how it's
 * shown. Every surface is a view over the registry (views.ts): the palette
 * and hotbar list the calls commands offer, and context menus list the calls
 * offered for the object they're opened on.
 */

export type ActionKind = "move" | "item" | "tool" | "command" | "entry" | "setting";
export type EntryGroup = "character" | "scene" | "note" | "library";

/** The objects context menus open on, and what identifies each. */
export interface CommandTargets {
  /** The campaign menu, at the start of the tool strip. */
  campaign: Record<never, never>;
  character: { id: string };
  note: { id: string };
  scene: { id: string };
  /** Selected elements on the open scene. */
  selection: { sceneId: string; ids: string[] };
  /** An empty place on the open scene. */
  canvas: { sceneId: string; at: { x: number; y: number } };
  chatMessage: { id: string };
  /** A folder in the characters, notes or scenes list. */
  folder: { tree: FolderTreeKind; id: string };
  /** An item in a character's inventory. */
  item: { characterId: string; itemId: string };
}
export type TargetKind = keyof CommandTargets;
export type FolderTreeKind = "character" | "note" | "scene";
export type Target = { [K in TargetKind]: { kind: K } & CommandTargets[K] }[TargetKind];

/**
 * Where an entry sits in a context menu: sections are kept in this order,
 * with dividers between them.
 */
export const MENU_SECTIONS = ["open", "play", "act", "arrange", "file", "edit", "delete"] as const;
export type MenuSection = (typeof MENU_SECTIONS)[number];

/** One call a command offers to a view, and how it reads there. */
export interface Offer<P> {
  params: P;
  /** Instead of the command's own title. */
  title?: string;
  detail?: string;
  tags?: string[];
  aliases?: string[];
  group?: EntryGroup;
  icon?: Icon;
  keys?: string[];
  /** Comes from the selected character, so it ranks first. */
  mine?: boolean;
  /** A secondary action, usually showing full text without running it. */
  open?: () => void;
}

type Shown<P, T> = T | ((ctx: CampaignContext, params: P) => T);

export interface TableCommand<P = void, R = unknown> extends Command<CampaignContext, P, R> {
  title: Shown<P, string>;
  kind?: ActionKind;
  icon?: Icon;
  aliases?: string[];
  /** Where it comes from: Core (the default), the game system, a character. */
  source?: Shown<P, string>;
  detail?: Shown<P, string | undefined>;
  /** Built-in shortcuts, as `comboOf` writes them; `Mod` is Cmd on a Mac and Ctrl elsewhere. The first is shown. */
  keys?: string[];
  danger?: boolean;
  /** For something that turns on and off: whether it's on. */
  checked?: (ctx: CampaignContext, params: P) => boolean;
  /** Asked before it runs from a menu, the palette, the hotbar or a shortcut. */
  confirm?: (ctx: CampaignContext, params: P) => Confirmation;
  /** The calls listed in the palette and pinnable to the hotbar. */
  offers?: (ctx: CampaignContext) => Offer<P>[];
  /** The calls listed in the context menu of each kind of object it applies to. */
  menu?: { [K in TargetKind]?: (ctx: CampaignContext, target: CommandTargets[K]) => Offer<P>[] };
  section?: MenuSection;
  /** Ways to type it in the chat box, like `/r 2d6`. */
  slash?: SlashForm<P>[];
}

/** One way to type a command in the chat box. */
export interface SlashForm<P> {
  /** The first is its name; the rest are other names for it. */
  names: string[];
  usage: string;
  help: string;
  /** The call for what's typed after the name, or what's wrong with it. */
  parse: (rest: string, ctx: CampaignContext, typed: ChatContent) => P | { error: string };
}

// oxlint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTableCommand = TableCommand<any> & AnyCommand<CampaignContext>;

/** Declare a command, inferring its parameters from its guard. */
export const command = <P = void, R = unknown>(c: TableCommand<P, R>): TableCommand<P, R> => c;

/** A call as the views show it: the command and parameters, how they read, and whether it can run. */
export interface Action {
  /** The call's key (kernel/commands.ts `callKey`), stored by the hotbar and shortcuts. */
  id: string;
  command: AnyTableCommand;
  params: unknown;
  kind: ActionKind;
  group?: EntryGroup;
  title: string;
  aliases?: string[];
  tags?: string[];
  source: string;
  detail?: string;
  /** Its built-in shortcuts, resolved for this platform. */
  keys?: string[];
  /** The shortcut shown beside it: the player's own, else its first built-in one. */
  hint?: string;
  icon?: Icon;
  danger?: boolean;
  checked?: boolean;
  /** True, or the reason it can't run now. Unavailable actions stay listed, dimmed. */
  available: Availability;
  mine?: boolean;
  /** Run it, asking first if the command wants confirming. */
  run: () => void;
  open?: () => void;
}
