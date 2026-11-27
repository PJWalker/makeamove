/*
 * Invite links look like `https://app/#join=<campaignId>.<roomKey>`. Both
 * parts sit in the URL fragment, so the room key never reaches a server.
 */

import { inviteText, readInvite } from "./inviteText";

export interface Invite {
  campaignId: string;
  roomKey: string;
}

export function inviteHash({ campaignId, roomKey }: Invite): string {
  return inviteText("", campaignId, roomKey);
}

export function inviteUrl(invite: Invite, base = location.href.split("#")[0]): string {
  return base + inviteHash(invite);
}

/** Read an invite from a link or a bare hash; null if it isn't one. */
export function parseInvite(text: string): Invite | null {
  const { found, campaignId, roomKey } = readInvite(text);
  return found ? { campaignId, roomKey } : null;
}
