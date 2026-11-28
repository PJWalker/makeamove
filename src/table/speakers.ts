import type { ChatMessage } from "../features/chat/types";
import type { SceneElement, TokenElement } from "../scene/types";

/*
 * Who speaks a chat message on the map: the token its speech bubble sits
 * at (table/SpeechBubbles.tsx).
 */

/** Each device's player characters, by device id. */
export type PlayedBy = Record<string, string[]>;

/**
 * The tokens on a scene that speak for a message: a move's character, or else
 * the sender's own player characters. Anyone with none here (often the GM)
 * speaks from the screen's edge instead.
 */
export function speakerTokens(
  m: ChatMessage,
  elements: readonly SceneElement[],
  playedBy: PlayedBy,
): TokenElement[] {
  const ids = new Set(m.kind === "move" ? [m.characterId] : (playedBy[m.author] ?? []));
  return elements.filter(
    (element): element is TokenElement =>
      element.type === "token" && ids.has(element.characterId ?? ""),
  );
}
