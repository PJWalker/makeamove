import type { CampaignRoot } from "../../campaign/schema";
import type { ChatContent } from "./content";
import type { Campaign } from "../../campaign/campaign";
import { useQuery } from "../../ui/useQuery";

/*
 * Chat messages never change, but some things about them do: a target's
 * answer to a roll request, damage the GM applied, and (M10) edits and pins.
 * Those live in one root-level map, keyed `messageId/field`, so answers from
 * different targets never conflict, and deleting a message drops its keys.
 */

export type MessageState = CampaignRoot["messageState"];

export function useMessageState<T = unknown>(
  campaign: Campaign,
  id: string,
  fields: string[],
): Record<string, T> {
  return JSON.parse(
    useQuery(campaign.messageState, () =>
      JSON.stringify(fieldsOf(campaign.messageState, id, fields)),
    ),
  ) as Record<string, T>;
}

const TEXT_FIELDS = ["text", "editedAt"];

export const useTextState = (campaign: Campaign, id: string) =>
  useMessageState<ChatContent | number>(campaign, id, TEXT_FIELDS);

/** Text as last edited, or as sent. */
export const editedText = (state: Record<string, unknown>, text: ChatContent): ChatContent =>
  (state.text as ChatContent | undefined) ?? text;

const key = (messageId: string, field: string) => `${messageId}/${field}`;

export function getState<T>(state: MessageState, messageId: string, field: string): T | undefined {
  return state.get(key(messageId, field)) as T | undefined;
}

export function setState(state: MessageState, messageId: string, field: string, value: unknown) {
  if (value === undefined) state.delete(key(messageId, field));
  else state.set(key(messageId, field), value);
}

/** Some of a message's fields, by name: direct lookups, so a long log's cards stay cheap. */
export function fieldsOf<T = unknown>(
  state: MessageState,
  messageId: string,
  fields: string[],
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const f of fields) {
    const v = state.get(key(messageId, f)) as T | undefined;
    if (v !== undefined) out[f] = v;
  }
  return out;
}

/** Messages with a field set to a truthy value (pinned ones), by id. */
export function withField(state: MessageState, field: string): string[] {
  const suffix = `/${field}`;
  const out: string[] = [];
  for (const [k, v] of state.entries())
    if (v && k.endsWith(suffix)) out.push(k.slice(0, -suffix.length));
  return out;
}

export function clearState(state: MessageState, messageId: string) {
  const prefix = `${messageId}/`;
  for (const k of state.keys()) if (k.startsWith(prefix)) state.delete(k);
}

/** A target's answer to a roll request: its total, and whether it met the DC. */
export interface SaveAnswer {
  total: number;
  /** The dice, as rolled, for the card: "14+2". */
  detail: string;
  success: boolean;
  by: string;
}

export const saveField = (targetId: string) => `save:${targetId}`;
export const appliedField = (targetId: string) => `applied:${targetId}`;
