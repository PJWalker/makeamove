import { describe, expect, it } from "vite-plus/test";
import { parseInvite } from "../invite";

describe("invites", () => {
  // Any page address plus an invite's hash reads back as that invite: proved in inviteText.ts.
  it("ignores anything else", () => {
    expect(parseInvite("")).toBeNull();
    expect(parseInvite("#/c/abc")).toBeNull();
    expect(parseInvite("#join=abc.short")).toBeNull();
    expect(parseInvite("#join=ABC.1234567890123456")).toBeNull();
  });
});
