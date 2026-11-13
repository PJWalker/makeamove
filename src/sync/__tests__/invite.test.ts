import { describe, expect, it } from "vite-plus/test";
import { inviteHash, inviteUrl, parseInvite } from "../invite";
import { newId, newSecret } from "../../lib/ids";

describe("invites", () => {
  it("round-trips through a link", () => {
    const invite = { campaignId: newId(), roomKey: newSecret() };
    expect(inviteHash(invite)).toBe(`#join=${invite.campaignId}.${invite.roomKey}`);
    expect(parseInvite(inviteUrl(invite, "https://app.example/"))).toEqual(invite);
    expect(parseInvite(inviteHash(invite))).toEqual(invite);
  });

  it("ignores anything else", () => {
    expect(parseInvite("")).toBeNull();
    expect(parseInvite("#/c/abc")).toBeNull();
    expect(parseInvite("#join=abc.short")).toBeNull();
    expect(parseInvite("#join=ABC.1234567890123456")).toBeNull();
  });
});
