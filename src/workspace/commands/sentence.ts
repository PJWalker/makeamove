import {
  actingCharacterId,
  canEdit,
  getCharacter,
  listCharacters,
} from "../../features/characters/api";
import type { TokenElement } from "../../scene/types";
import type { CampaignContext } from "../campaignContext";
import { CONTEXT, EMPTY, fill } from "./slots";
import type { Signature, Word } from "./slots";
import type { Action, AnyTableCommand, Offer, Target, TargetKind } from "./types";
import { actionFor, registered } from "./views";

/*
 * Sentences in the palette: names of characters and tokens, and the words
 * of a command, in any order: "Mira hack and slash goblin", "goblin lock",
 * "selected delete". Names fill a command's slots (slots.ts); what's left
 * is matched against the commands that fit. Slots no name fills come from
 * the context: the acting character acts, on the hovered token.
 */

/** Something a name can stand for: a character, its or others' tokens on the open scene, or the selection. */
export interface Entity {
  name: string;
  /** The name's words, lower case, as they're matched. */
  words: string[];
  characterId?: string;
  /** A character the player plays, who can act. */
  actor: boolean;
  /** Its tokens on the open scene. */
  tokenIds: string[];
}

/** A name as typed in a sentence. */
export interface Named {
  entity: Entity;
  beforeVerb: boolean;
}

/** A sentence, read: the names in it, and the rest, which says what to do. */
export interface Reading {
  names: Named[];
  verb: string;
  /** Names the last thing typed could be the start of, to complete it to. */
  completions: Entity[];
}

/** Words that read naturally in a sentence but say nothing: "hack and slash at the goblin". */
const FILLER = new Set(["a", "an", "at", "on", "the", "to", "with"]);

/** How many words of a name the palette offers to complete. */
const COMPLETED_WORDS = 3;

const wordsOf = (text: string) => text.toLowerCase().split(/\s+/).filter(Boolean);

/** Everything the open campaign's names can stand for. */
export function entities(context: CampaignContext): Entity[] {
  const { campaign } = context;
  const o = context.canvas.canvasCommands.value;
  const tokens = (o?.controller.allElements() ?? []).filter(
    (element): element is TokenElement => element.type === "token",
  );
  const tokensOf = (id: string) => tokens.flatMap((t) => (t.characterId === id ? [t.id] : []));
  const out: Entity[] = listCharacters(campaign).map((c) => ({
    name: c.name,
    words: wordsOf(c.name),
    characterId: c.id,
    actor: canEdit(campaign, c),
    tokenIds: tokensOf(c.id),
  }));
  // Tokens that aren't a character's, one name for all those that share it ("goblin").
  const byName = new Map<string, Entity>();
  for (const t of tokens) {
    if (t.characterId && getCharacter(campaign, t.characterId)) continue;
    const key = t.name.trim().toLowerCase();
    if (!key) continue;
    const e = byName.get(key) ?? {
      name: t.name.trim(),
      words: wordsOf(key),
      actor: false,
      tokenIds: [],
    };
    e.tokenIds.push(t.id);
    byName.set(key, e);
  }
  out.push(...byName.values());
  const selected = o?.controller.selection.value ?? [];
  out.push({ name: "Selected", words: ["selected"], actor: false, tokenIds: selected });
  const me = getCharacter(campaign, actingCharacterId(campaign));
  if (me && canEdit(campaign, me))
    out.push({ name: me.name, words: ["me"], characterId: me.id, actor: true, tokenIds: [] });
  return out.filter((e) => e.words.length > 0);
}

/** Whether `words` from `at` start with all of `name`. */
const startsWith = (words: string[], at: number, name: string[]) =>
  name.every((w, index) => words[at + index] === w);

/**
 * Read a sentence: whole names, longest first, are names; filler words are
 * dropped; the rest says what to do.
 */
export function readSentence(text: string, known: Entity[]): Reading {
  const words = wordsOf(text);
  const longestFirst = known.toSorted((a, b) => b.words.length - a.words.length);
  const names: Named[] = [];
  const verb: string[] = [];
  let lastIsName = false;
  for (let index = 0; index < words.length;) {
    const entity = longestFirst.find((e) => startsWith(words, index, e.words));
    if (entity) {
      names.push({ entity, beforeVerb: verb.length === 0 });
      index += entity.words.length;
      lastIsName = true;
      continue;
    }
    const word = words[index]!;
    if (!FILLER.has(word)) verb.push(word);
    index++;
    lastIsName = false;
  }
  return {
    names,
    verb: verb.join(" "),
    completions: lastIsName || /\s$/.test(text) ? [] : completing(words, known),
  };
}

/** Names the last one to three words typed are the start of. */
function completing(words: string[], known: Entity[]): Entity[] {
  for (let n = Math.min(COMPLETED_WORDS, words.length); n > 0; n--) {
    const typed = words.slice(-n).join(" ");
    const found = known.filter((e) => {
      const name = e.words.join(" ");
      return name !== typed && name.startsWith(typed);
    });
    if (found.length > 0) return found;
  }
  return [];
}

/** The text with its last words completed to `entity`'s name. */
export function complete(text: string, entity: Entity): string {
  const words = text.trimEnd().split(/\s+/);
  for (let n = Math.min(COMPLETED_WORDS, words.length); n > 0; n--) {
    const typed = words.slice(-n).join(" ").toLowerCase();
    if (entity.words.join(" ").startsWith(typed))
      return `${[...words.slice(0, -n), entity.name].join(" ")} `;
  }
  return `${text} ${entity.name} `;
}

/** What an entity is as a target of `kind`, if it can be one. */
function asTarget(context: CampaignContext, e: Entity, kind: TargetKind): Target | undefined {
  const sceneId = context.canvas.canvasCommands.value?.sceneId;
  if (kind === "selection" && sceneId && e.tokenIds.length > 0)
    return { kind, sceneId, ids: e.tokenIds };
  if (kind === "character" && e.characterId) return { kind, id: e.characterId };
  return undefined;
}

/** One way a command reads a sentence: its slots, what it acts on, and the calls it offers for them. */
interface Verb {
  command: AnyTableCommand;
  signature: Signature;
  takes: TargetKind[];
  offers: (actor: string | undefined, object: Target | undefined) => Offer<unknown>[];
}

/** A command acting on what its menu for `kind` is opened on: "goblin lock". */
function menuVerb(
  context: CampaignContext,
  command: AnyTableCommand,
  kind: "character" | "selection",
): Verb | undefined {
  const signature: Signature = { subject: "none", object: "required" };
  const plain = (offers: Offer<unknown>[]) => offers.map((o) => ({ ...o, verb: undefined }));
  if (kind === "selection") {
    const offered = command.menu?.selection;
    return offered
      ? {
          command,
          signature,
          takes: [kind],
          offers: (_, o) => (o?.kind === kind ? plain(offered(context, o)) : []),
        }
      : undefined;
  }
  const offered = command.menu?.character;
  return offered
    ? {
        command,
        signature,
        takes: [kind],
        offers: (_, o) => (o?.kind === kind ? plain(offered(context, o)) : []),
      }
    : undefined;
}

/** Every way the table's commands read sentences: their own, and acting on what their menus are for. */
function verbs(context: CampaignContext): Verb[] {
  const out: Verb[] = [];
  for (const command of registered(context)) {
    const { sentence } = command;
    if (sentence) {
      out.push({
        command,
        signature: { subject: "required", object: sentence.object },
        takes: ["selection"],
        offers: (actor, object) => (actor ? sentence.offers(context, actor, object) : []),
      });
    }
    for (const kind of ["selection", "character"] as const) {
      const verb = menuVerb(context, command, kind);
      if (verb) out.push(verb);
    }
  }
  return out;
}

/** What the context fills empty slots with: the acting character, and the hovered token. */
function defaults(context: CampaignContext): { actor?: string; object?: Target } {
  const { campaign } = context;
  const me = getCharacter(campaign, actingCharacterId(campaign));
  const o = context.canvas.canvasCommands.value;
  const hovered = o?.controller.hoveredToken.value;
  return {
    ...(me && canEdit(campaign, me) ? { actor: me.id } : {}),
    ...(o && hovered ? { object: { kind: "selection", sceneId: o.sceneId, ids: [hovered] } } : {}),
  };
}

/** The name a target is shown by. */
function targetName(context: CampaignContext, target: Target, known: Entity[]): string {
  if (target.kind === "character") return getCharacter(context.campaign, target.id)?.name ?? "";
  if (target.kind !== "selection") return "";
  const ids = target.ids.join(" ");
  const named = known.find((e) => e.tokenIds.join(" ") === ids);
  const one = context.canvas.canvasCommands.value?.controller.element(target.ids[0] ?? "");
  if (named) return named.name;
  return one?.type === "token" ? one.name : "Selected";
}

/** A slot's filling: a typed name's, the context's, or nothing. */
function slot<T>(at: number, typed: (index: number) => T | undefined, context: T | undefined) {
  if (at === CONTEXT) return context;
  return at === EMPTY ? undefined : typed(at);
}

/** How a verb reads the names typed: who acts and what on, if it reads them at all. */
function reads(context: CampaignContext, verb: Verb, names: Named[]) {
  const targetOf = (e: Entity) =>
    verb.takes.map((kind) => asTarget(context, e, kind)).find((t) => t !== undefined);
  const words: Word[] = names.map(({ entity, beforeVerb }) => ({
    actor: entity.actor && entity.characterId !== undefined,
    object: targetOf(entity) !== undefined,
    beforeVerb,
  }));
  const fallback = defaults(context);
  const f = fill(verb.signature, words, {
    subject: fallback.actor !== undefined,
    object: fallback.object !== undefined,
  });
  if (!f.ok) return undefined;
  // With no names typed, the palette already lists what uses only the acting character.
  if (names.length === 0 && f.object !== CONTEXT) return undefined;
  const actor = slot(f.subject, (index) => names[index]?.entity.characterId, fallback.actor);
  const object = slot(
    f.object,
    (index) => names[index] && targetOf(names[index].entity),
    fallback.object,
  );
  return { actor, object };
}

/**
 * The calls a sentence makes: for each command that reads it, the calls it
 * offers once its slots are filled. With no names typed, only calls that act
 * on the hovered token, since the palette lists the rest already.
 */
export function sentenceActions(
  context: CampaignContext,
  reading: Reading,
  known: Entity[],
): Action[] {
  const out = new Map<string, Action>();
  for (const verb of verbs(context)) {
    const read = reads(context, verb, reading.names);
    if (!read) continue;
    const { actor, object } = read;
    const detail = [
      actor && getCharacter(context.campaign, actor)?.name,
      object && targetName(context, object, known),
    ]
      .filter(Boolean)
      .join(" → ");
    for (const offer of verb.offers(actor, object)) {
      if (context.commands.permits(verb.command, offer.params) !== true) continue;
      const action = actionFor(context, verb.command, { ...offer, ...(detail ? { detail } : {}) });
      if (!out.has(action.id)) out.set(action.id, checkedRun(context, action));
    }
  }
  return [...out.values()];
}

/**
 * Runs a sentence's call only if it reads back as one the command accepts:
 * whatever a sentence names, what runs is a call that passes its guard.
 */
function checkedRun(context: CampaignContext, action: Action): Action {
  return {
    ...action,
    run: () => {
      if (context.commands.resolve(action.id)) action.run();
    },
  };
}
