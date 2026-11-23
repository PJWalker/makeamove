import { describe, expect, it } from "vite-plus/test";
import { playback, playbackMode } from "../playback";
import type { Playback, PlaybackEvent } from "../playback";

const running: Playback = { paused: false, hidden: false, reducedMotion: false };
function after(...events: PlaybackEvent[]) {
  let state = running;
  for (const event of events) state = playback(state, event);
  return state;
}

describe("the cave's playback", () => {
  it("stays paused when the page is hidden and shown again", () => {
    const state = after({ type: "pause" }, { type: "visibility", hidden: true }, {
      type: "visibility",
      hidden: false,
    });
    expect(playbackMode(state)).toBe("still");
  });

  it("stays paused when reduced motion is turned off", () => {
    const state = after(
      { type: "motion", reduced: true },
      { type: "pause" },
      { type: "motion", reduced: false },
    );
    expect(playbackMode(state)).toBe("still");
  });

  it("resumes animating after a hidden page comes back", () => {
    const state = after({ type: "visibility", hidden: true }, { type: "visibility", hidden: false });
    expect(playbackMode(state)).toBe("animate");
  });
});
