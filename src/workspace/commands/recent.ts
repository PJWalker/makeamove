import type { LocalDoc, LocalValue } from "../../data/localDoc";

const MAX = 12;

function read(stored: unknown): string[] {
  if (stored === undefined) return [];
  if (!Array.isArray(stored)) {
    console.warn("Ignoring stored recent actions: not a list", stored);
    return [];
  }
  return stored.filter((x): x is string => typeof x === "string").slice(0, MAX);
}

/** Recently run actions, newest first, remembered in the campaign's local document. */
export class RecentActions {
  readonly ids: LocalValue<string[]>;

  constructor(local: LocalDoc) {
    this.ids = local.value("recentActions", read);
  }

  note(id: string) {
    this.ids.value = [id, ...this.ids.value.filter((x) => x !== id)].slice(0, MAX);
  }
}
