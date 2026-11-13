import type { Guard } from "../data/schema";
import type { UndoStack } from "../data/undo";
import type { UndoHistory } from "./undo";

/*
 * Commands: every change to campaign state, and every action a player can
 * take, is a registered command. `execute` is the one way to run one: it
 * checks permission and availability, runs it as one transaction, and tags
 * the transaction so it's one step in the player's undo history.
 *
 * Menus, the palette, the hotbar, shortcuts, the toolbar and slash commands
 * are views over the registry, so they can't drift apart. Calls are
 * serialisable (`callKey`), so the hotbar and shortcuts store them by key.
 */

/** True, or why it can't run now. */
export type Availability = true | string;

export const GM_ONLY = "GM only";

export type Permission<C, P> = "anyone" | "gm" | ((ctx: C, params: P) => Availability);

/** What a context needs to run commands against. */
export interface CommandHost {
  isGm(): boolean;
  /** Run `fn` as one transaction on the shared document, tagged as the player's own undoable change or not. */
  transact<T>(fn: () => T, undoable: boolean): T;
  readonly history: UndoHistory;
  /** The shared document's undo stack, in `history`. */
  readonly undoStack: UndoStack;
}

export interface Command<C, P = void, R = unknown> {
  /** Stable and namespaced, like `character.delete`. Stored by the hotbar and shortcuts. */
  readonly id: string;
  /** Checks a stored or typed call's parameters before it runs. */
  readonly params: Guard<P>;
  /** Who may run it: anyone (the default), the GM, or a check of its own. */
  readonly permission?: Permission<C, P>;
  /** Whether it can run now; checked after permission. */
  readonly available?: (ctx: C, params: P) => Availability;
  readonly run: (ctx: C, params: P) => R;
  /**
   * Runs one after another in the same group are one undo step (dragging a
   * slider, typing in a field); `false` keeps the change out of undo, for
   * things that can't sensibly be taken back, like sending a message.
   */
  readonly undoGroup?: string | false | ((params: P) => string | false);
  /**
   * False runs it outside any transaction: for undo and redo, which make
   * their own, and for commands that only change what this player sees.
   */
  readonly transact?: false;
  /**
   * Stands in for the command registered under the same id: calls to it run
   * this instead (a game system's own way of using an item, say).
   */
  readonly replaces?: true;
}

/** Any command, whatever its parameters. */
// oxlint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyCommand<C> = Command<C, any>;

/** A command and its parameters, as one value. */
export interface Call<K> {
  command: K;
  params: unknown;
}

/** A call as a string, for storing: the command's id, then its parameters as JSON. */
export function callKey(id: string, params: unknown): string {
  const empty =
    params === undefined ||
    params === null ||
    (typeof params === "object" && !Object.keys(params).length);
  return empty ? id : `${id} ${JSON.stringify(params)}`;
}

function parseKey(key: string): { id: string; params: unknown } | null {
  const space = key.indexOf(" ");
  if (space < 0) return { id: key, params: undefined };
  try {
    return { id: key.slice(0, space), params: JSON.parse(key.slice(space + 1)) as unknown };
  } catch {
    return null;
  }
}

export class CommandRegistry<C extends CommandHost, K extends AnyCommand<C> = AnyCommand<C>> {
  readonly #ctx: C;
  readonly #byId = new Map<string, K>();
  /** Commands standing in for others, by their shared id. */
  readonly #stand = new Map<string, K>();
  readonly #warned = new Set<string>();

  constructor(ctx: C) {
    this.#ctx = ctx;
  }

  /** Add commands; the returned function removes them again. */
  register(commands: readonly K[]): () => void {
    for (const c of commands) {
      if (c.replaces) this.#stand.set(c.id, c);
      else if (this.#byId.has(c.id))
        console.error(`Command ${c.id} is registered twice; keeping the first`);
      else this.#byId.set(c.id, c);
    }
    return () => {
      for (const c of commands) {
        if (this.#byId.get(c.id) === c) this.#byId.delete(c.id);
        if (this.#stand.get(c.id) === c) this.#stand.delete(c.id);
      }
    };
  }

  get(id: string): K | undefined {
    return this.#stand.get(id) ?? this.#byId.get(id);
  }

  /** Every command, in the order registered; ones standing in for others are in their place. */
  all(): K[] {
    return [...this.#byId.values()].map((c) => this.#stand.get(c.id) ?? c);
  }

  /** What actually runs for a command: whatever stands in for it, else itself. */
  #actual<P, R>(command: Command<C, P, R>): Command<C, P, R> {
    return (this.#stand.get(command.id) as Command<C, P, R> | undefined) ?? command;
  }

  /** Whether the player may run the call at all, whatever the state of things. */
  permits<P>(command: Command<C, P, unknown>, params: P): Availability {
    const p = this.#actual(command).permission ?? "anyone";
    if (p === "anyone") return true;
    if (p === "gm") return this.#ctx.isGm() || GM_ONLY;
    return p(this.#ctx, params);
  }

  /** Whether the player may run the call now: permission first, then availability. */
  check<P>(command: Command<C, P, unknown>, params: P): Availability {
    const allowed = this.permits(command, params);
    if (allowed !== true) return allowed;
    return this.#actual(command).available?.(this.#ctx, params) ?? true;
  }

  /**
   * Run a command, if the player may and it can run now: as one transaction,
   * and one undo step unless it opts out. Returns what the command returns,
   * or undefined if it didn't run.
   */
  execute<P, R>(given: Command<C, P, R>, params: P): R | undefined {
    const command = this.#actual(given);
    const why = this.check(command, params);
    if (why !== true) {
      console.warn(`Command ${command.id} did not run: ${why}`);
      return undefined;
    }
    const ctx = this.#ctx;
    if (command.transact === false) return command.run(ctx, params);
    const g = command.undoGroup;
    const group = typeof g === "function" ? g(params) : g;
    if (group !== false) ctx.history.begin(ctx.undoStack, group);
    return ctx.transact(() => command.run(ctx, params), group !== false);
  }

  /**
   * Run several calls as one step: one transaction and one undo step, for
   * something a player does that's made of several changes. Each call still
   * checks its own permission.
   */
  batch<R>(fn: () => R): R {
    const ctx = this.#ctx;
    ctx.history.begin(ctx.undoStack, undefined);
    return ctx.transact(fn, true);
  }

  /**
   * A stored call, from its key: the command and checked parameters, or null
   * (logged once) if the command is gone or the parameters don't fit it.
   */
  resolve(key: string): Call<K> | null {
    const parsed = parseKey(key);
    const command = parsed && this.get(parsed.id);
    if (!parsed || !command || !command.params(parsed.params)) {
      if (!this.#warned.has(key)) {
        this.#warned.add(key);
        console.warn(
          `Ignoring stored command call "${key}": ${command ? "its parameters don't fit" : "no such command"}`,
        );
      }
      return null;
    }
    return { command, params: parsed.params };
  }
}
