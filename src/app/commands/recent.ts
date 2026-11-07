import { signal } from "@preact/signals-react";
import { getStorageJson, setStorageJson } from "../../platform/localStorage";

/** Recently run actions, newest first, remembered on this device. */
const KEY = "mam:recent-actions";
const MAX = 12;

function load(): string[] {
  const v = getStorageJson<unknown>(KEY, []);
  return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, MAX) : [];
}

export const recentActions = signal<string[]>(load());

export function noteRecent(id: string) {
  recentActions.value = [id, ...recentActions.value.filter((x) => x !== id)].slice(0, MAX);
  setStorageJson(KEY, recentActions.value);
}
