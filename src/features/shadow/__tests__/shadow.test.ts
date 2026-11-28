import { describe, expect, it } from "vite-plus/test";
import { Doc } from "yjs";
import { rootOf } from "../../../data/schema";
import { store } from "../../../lib/store";
import { contentFromText } from "../../chat/content";
import type { ChatMessage } from "../../chat/types";
import { shadowShape } from "../schema";
import { Shadow } from "../shadow";
import { FakeModel } from "./fakeModel";
import { FakeSpeech } from "./fakeSpeech";

/** Few enough tokens that a long session has to be folded into a summary. */
const SMALL_CONTEXT = 1400;
const LONG_SESSION = 40;

let n = 0;
const STAMP_WIDTH = 9;
const stamp = () => `${String(++n).padStart(STAMP_WIDTH, "0")}:0000:x`;
function said(by: { id: string; name: string }, text: string, to?: string[]): ChatMessage {
  return {
    kind: "text",
    id: `m${String(n)}`,
    hlc: stamp(),
    author: by.id,
    name: by.name,
    text: contentFromText(text),
    ...(to ? { to } : {}),
  };
}
const pat = { id: "pat", name: "Pat" };
const gwen = { id: "gm", name: "Gwen" };

function setUp(model = new FakeModel(), speech = new FakeSpeech()) {
  const memory = rootOf(new Doc(), shadowShape);
  const messages = store<ChatMessage[]>([]);
  const turn = store<string | null>(null);
  const shadow = new Shadow({ gm: "gm", messages, turn }, memory, { model, speech });
  return { shadow, memory, messages, model, speech };
}

describe("the GM shadow's model", () => {
  it("says so, and does nothing, where there's no on-device model", async () => {
    const { shadow } = setUp(new FakeModel("unavailable"));
    await shadow.check();
    expect(shadow.status.value).toEqual({ kind: "unavailable" });
  });

  it("downloads the model when the GM asks it to watch, showing progress", async () => {
    const { shadow } = setUp(new FakeModel("downloadable"));
    await shadow.check();
    expect(shadow.status.value.kind).toBe("downloadable");
    const seen: string[] = [];
    shadow.status.subscribe(() => seen.push(JSON.stringify(shadow.status.value)));
    await shadow.begin();
    expect(seen).toContain(JSON.stringify({ kind: "downloading", progress: 0.5 }));
    expect(shadow.status.value).toEqual({ kind: "ready" });
    expect(shadow.watching.value).toBe(true);
  });

  it("doesn't read the session until the GM turns it on", async () => {
    const { shadow, messages, model } = setUp();
    await shadow.check();
    messages.value = [said(pat, "I open the door")];
    await shadow.think();
    expect(model.prompts).toEqual([]);
  });
});

describe("what the GM shadow reads and remembers", () => {
  it("remembers what it suggests and learns, in its own memory", async () => {
    const { shadow, messages, model } = setUp();
    model.reply = JSON.stringify({
      ideas: ["The innkeeper's brother arrives, armed."],
      facts: [{ name: "Mirela", facts: ["runs the Gilded Goose"] }],
      threads: [{ title: "The missing caravan", resolved: false }],
    });
    await shadow.begin();
    messages.value = [said(gwen, "Mirela, who runs the inn, mentions the missing caravan")];
    await shadow.think();
    const v = shadow.view.value;
    expect(v.ideas.map((i) => i.text)).toEqual(["The innkeeper's brother arrives, armed."]);
    expect(v.facts).toMatchObject([{ name: "Mirela", facts: ["runs the Gilded Goose"] }]);
    expect(v.threads).toMatchObject([{ title: "The missing caravan", forgotten: false }]);
  });

  it("never reads a whisper between players", async () => {
    const { shadow, messages, model } = setUp();
    await shadow.begin();
    messages.value = [
      said(pat, "Let's steal the idol", ["sam"]),
      said(pat, "I ask the GM about the idol", ["gm"]),
    ];
    await shadow.think();
    expect(model.prompts.join("\n")).not.toContain("steal the idol");
    expect(model.prompts.join("\n")).toContain("ask the GM about the idol");
  });

  it("folds older lines into a summary when they no longer fit the model's context", async () => {
    const model = new FakeModel("available", SMALL_CONTEXT);
    const { shadow, messages, memory } = setUp(model);
    model.summary = "Pat opened many doors.";
    await shadow.begin();
    messages.value = Array.from({ length: LONG_SESSION }, (_, i) =>
      said(pat, `I open door number ${String(i)} and look around carefully`),
    );
    await shadow.think();
    expect(memory.shadowState.get("summary")).toBe("Pat opened many doors.");
    const analysis = model.prompts.at(-1)!;
    expect(analysis).toContain("Pat opened many doors.");
    expect(analysis).toContain(`door number ${String(LONG_SESSION - 1)}`);
    expect(analysis).not.toContain("door number 0 ");
  });
});

describe("the GM shadow listening", () => {
  it("transcribes the GM only while they've turned listening on", async () => {
    const { shadow, speech } = setUp();
    speech.say("Before listening");
    await shadow.voice.start();
    expect(shadow.voice.status.value).toEqual({ kind: "listening" });
    speech.say("The bridge creaks under you.");
    shadow.voice.stop();
    speech.say("After listening");
    expect(shadow.voice.status.value).toEqual({ kind: "off" });
    expect(shadow.view.value.heard.map((l) => l.text)).toEqual([
      "GM (aloud): The bridge creaks under you.",
    ]);
  });

  it("won't listen without on-device speech recognition", async () => {
    const { shadow, speech } = setUp(new FakeModel(), new FakeSpeech("unavailable"));
    await shadow.voice.start();
    expect(shadow.voice.status.value).toEqual({ kind: "unavailable" });
    expect(speech.onPhrase).toBeNull();
  });

  it("sets up on-device speech recognition first if it isn't there yet", async () => {
    const { shadow, speech } = setUp(new FakeModel(), new FakeSpeech("downloadable"));
    await shadow.voice.start();
    expect(speech.installed).toBe(true);
    expect(shadow.voice.status.value).toEqual({ kind: "listening" });
  });
});
