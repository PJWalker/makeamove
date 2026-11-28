import { describe, expect, it } from "vite-plus/test";
import { encodeStateAsUpdate } from "yjs";
import { PeerHarness } from "../../../campaign/__tests__/peerHarness";
import type { Peer } from "../../../campaign/__tests__/peerHarness";
import { contentFromText } from "../../chat/content";
import { shadowFor } from "../source";
import { FakeModel } from "./fakeModel";
import { FakeSpeech } from "./fakeSpeech";

const IDEA = "The duke's spy has been listening all along.";

/** Every byte of the campaign a peer holds: its root and each open subdocument. */
function everything(p: Peer): string {
  const docs = [p.campaign.doc, ...p.openSubdocs().values()];
  return docs.map((d) => new TextDecoder().decode(encodeStateAsUpdate(d))).join("\n");
}

describe("the GM shadow at a table", () => {
  it("is the GM's alone: players get none, and nothing it makes reaches them", async () => {
    const h = new PeerHarness();
    const gm = await h.create("gm", "Gwen", "The Lost Barrows");
    const pat = await h.join("pat", "Pat");

    expect(pat.do((c) => shadowFor(c))).toBeNull();

    const model = new FakeModel();
    model.reply = JSON.stringify({
      ideas: [IDEA],
      facts: [{ name: "Duke Orsin", facts: ["keeps a spy at the inn"] }],
      threads: [{ title: "Who poisoned the well", resolved: false }],
    });
    const speech = new FakeSpeech();
    const shadow = gm.do((c) => shadowFor(c, { model, speech }))!;
    await gm.do(async () => {
      await shadow.begin();
      await shadow.voice.start();
      speech.say("Duke Orsin smiles thinly.");
    });
    await pat.do(async (c) =>
      c.chat.post(
        { kind: "text", text: contentFromText("Who poisoned the well?") },
        pat.identity.value,
      ),
    );
    await h.settle();
    await gm.do(async () => shadow.think());
    await h.settle();

    expect(model.prompts.join("\n")).toContain("Pat: Who poisoned the well?");
    expect(shadow.view.value.ideas.map((i) => i.text)).toEqual([IDEA]);
    const theirs = everything(pat);
    expect(theirs).toContain("Who poisoned the well?");
    for (const secret of [IDEA, "Duke Orsin", "keeps a spy", "smiles thinly"])
      expect(theirs).not.toContain(secret);
    shadow.destroy();
  });
});
