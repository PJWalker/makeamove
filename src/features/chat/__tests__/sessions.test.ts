import { describe, expect, it } from "vite-plus/test";
import { contentFromText, messageText } from "../content";
import { logRows, splitSessions } from "../sessions";
import type { ChatMessage } from "../types";

let n = 0;
const text = (t: string, author = "pat"): ChatMessage => ({
  kind: "text",
  text: contentFromText(t),
  id: `m${n++}`,
  hlc: `${n}`,
  author,
  name: author,
});
const marker = (session: number, end = false): ChatMessage => ({
  kind: "system",
  text: `Session ${session} ${end ? "ends" : "begins"}`,
  event: end ? "session-end" : "session-start",
  session,
  id: `s${session}${end ? "e" : ""}`,
  hlc: `${n++}`,
  author: "gm",
  name: "Gwen",
});

describe("splitting the log into sessions", () => {
  // Where parts begin is proved in partStarts.ts; this checks the parts built from it.
  it("starts a part at each session, with ends and stragglers in the session they follow", () => {
    const parts = splitSessions([
      text("pre"),
      marker(1),
      text("one"),
      marker(1, true),
      text("after one"),
      marker(2),
      text("two"),
    ]);
    expect(parts.map((p) => [p.key, p.messages.length, p.current])).toEqual([
      ["before", 1, false],
      ["s1", 3, false],
      ["s2", 1, true],
    ]);
  });
});

describe("the rows the log shows", () => {
  const log = () => [
    text("pre"),
    marker(1),
    text("one"),
    text("one more"),
    marker(2),
    text("two", "kim"),
    text("two again", "kim"),
    text("reply"),
  ];
  const describeRows = (rows: ReturnType<typeof logRows>) =>
    rows.map((r) => {
      if (r.kind === "fold") return `fold ${r.title} (${r.count})${r.open ? " open" : ""}`;
      const text =
        r.m.kind === "text" ? messageText(r.m.text) : r.m.kind === "system" ? r.m.text : "";
      return `${text}${r.header ? " *" : ""}`;
    });

  it("folds earlier sessions and shows the current one from its marker, with a header where the speaker changes", () => {
    expect(describeRows(logRows(log(), () => false))).toEqual([
      "fold Before the first session (1)",
      "fold Session 1 (2)",
      "Session 2 begins",
      "two *",
      "two again",
      "reply *",
    ]);
  });
  it("follows an open session's fold with its messages", () => {
    const rows = logRows(log(), (key) => key === "s1");
    expect(describeRows(rows).slice(1, 4)).toEqual([
      "fold Session 1 (2) open",
      "one *",
      "one more",
    ]);
  });
  it("gives every row its own key", () => {
    const keys = logRows(log(), () => false).map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
