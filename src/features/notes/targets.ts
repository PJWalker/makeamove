import { getCharacter, listCharacters, systemOf } from "../characters/api";
import type { Campaign } from "../../campaign/campaign";
import { listNotes } from "./api";
import type { LinkKind } from "./links";

/** Something a note can link to, as offered after typing `@`. */
export interface LinkTarget {
  kind: LinkKind;
  id: string;
  label: string;
  /** What it is, shown beside the label. */
  detail: string;
  /** An icon name for items and moves (ui/entryIcons.tsx). */
  icon?: string;
  /** A GM-only page. */
  gmOnly?: boolean;
}

const KIND_DETAIL: Record<LinkKind, string> = {
  note: "Note",
  character: "Character",
  scene: "Scene",
  item: "Gear",
  move: "Move",
};

export function characterLinkTargets(campaign: Campaign): LinkTarget[] {
  return listCharacters(campaign).map((character) => ({
    kind: "character",
    id: character.id,
    label: character.name,
    detail: character.kind === "npc" ? "NPC" : KIND_DETAIL.character,
  }));
}

export function matchingLinkTargets(targets: LinkTarget[], query: string, limit = 8): LinkTarget[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return targets.slice(0, limit);
  const starts = targets.filter((target) => target.label.toLowerCase().startsWith(normalized));
  const contains = targets.filter(
    (target) =>
      !target.label.toLowerCase().startsWith(normalized) &&
      target.label.toLowerCase().includes(normalized),
  );
  return [...starts, ...contains].slice(0, limit);
}

/** Link targets matching a query: notes, characters, scenes, then the system's items and moves. */
export function linkTargets(
  campaign: Campaign,
  query: string,
  exceptNote?: string,
  limit = 8,
): LinkTarget[] {
  const system = systemOf(campaign);
  const all: LinkTarget[] = [
    ...listNotes(campaign)
      .filter((n) => n.id !== exceptNote)
      .map((n) => ({
        kind: "note" as const,
        id: n.id,
        label: n.title,
        detail: n.gmOnly ? "GM page" : KIND_DETAIL.note,
        gmOnly: n.gmOnly,
      })),
    ...characterLinkTargets(campaign),
    ...campaign
      .sceneViews()
      .map((s) => ({ kind: "scene" as const, id: s.id, label: s.name, detail: KIND_DETAIL.scene })),
    ...system.items.map((i) => ({
      kind: "item" as const,
      id: i.id,
      label: i.name,
      detail: KIND_DETAIL.item,
      ...(i.icon ? { icon: i.icon } : {}),
    })),
    ...system.actions.map((m) => ({
      kind: "move" as const,
      id: m.id,
      label: m.name,
      detail: KIND_DETAIL.move,
      ...(m.category === "class" ? { icon: "class-move" } : {}),
    })),
  ];
  return matchingLinkTargets(all, query, limit);
}

/** The current name of a link's target, or null if it's gone. */
export function linkLabel(campaign: Campaign, kind: LinkKind, id: string): string | null {
  const system = systemOf(campaign);
  switch (kind) {
    case "note":
      return listNotes(campaign).find((n) => n.id === id)?.title ?? null;
    case "character":
      return getCharacter(campaign, id)?.name ?? null;
    case "scene":
      return campaign.sceneViews().find((s) => s.id === id)?.name ?? null;
    case "item":
      return system.items.find((i) => i.id === id)?.name ?? null;
    case "move":
      return system.actions.find((m) => m.id === id)?.name ?? null;
  }
}

/** What a link points at, in a sentence or two, for its tooltip; null if it's gone. */
export function linkTip(campaign: Campaign, kind: LinkKind, id: string): string | null {
  const system = systemOf(campaign);
  switch (kind) {
    case "note": {
      const n = listNotes(campaign).find((x) => x.id === id);
      return n ? `${n.title}\n${n.gmOnly ? "GM page" : "Note"}` : null;
    }
    case "character": {
      const c = getCharacter(campaign, id);
      if (!c) return null;
      const what = c.kind === "npc" ? (c.template ? "NPC template" : "NPC") : "Character";
      return `${c.name}\n${what}`;
    }
    case "scene": {
      const s = campaign.sceneViews().find((x) => x.id === id);
      return s ? `${s.name}\nScene` : null;
    }
    case "item": {
      const i = system.items.find((x) => x.id === id);
      return i ? `${i.name}\n${i.description}` : null;
    }
    case "move": {
      const m = system.actions.find((x) => x.id === id);
      return m ? `${m.name}\n${m.trigger}` : null;
    }
  }
}
