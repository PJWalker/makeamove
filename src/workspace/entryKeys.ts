/** What an entry window shows: a character's gear, a move on a character's sheet, or a library entry. */
export type EntryRef =
  | { kind: "inventory"; characterId: string; itemId: string }
  | { kind: "move"; ownerId: string; moveId: string }
  | { kind: "lib"; key: string };

export const inventoryKey = (characterId: string, itemId: string) =>
  `inventory:${characterId}:${itemId}`;

export const moveKey = (ownerId: string, moveId: string) => `move:${ownerId}:${moveId}`;

/** The entry a window key names; ids after the first colon may hold colons. */
export function parseEntryKey(key: string): EntryRef | undefined {
  const [kind, rest] = splitOnce(key, ":");
  if (kind === "lib") return { kind, key };
  const [first, second] = splitOnce(rest, ":");
  if (!first || !second) return undefined;
  if (kind === "inventory") return { kind, characterId: first, itemId: second };
  if (kind === "move") return { kind, ownerId: first, moveId: second };
  return undefined;
}

function splitOnce(text: string, separator: string): [string, string] {
  const at = text.indexOf(separator);
  return at < 0 ? [text, ""] : [text.slice(0, at), text.slice(at + 1)];
}
