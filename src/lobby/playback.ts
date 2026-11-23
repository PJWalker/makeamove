/*
 * Whether the cave animates, holds a still picture, or draws nothing. The
 * viewer's own pause, a hidden page and reduced motion are kept apart, so that
 * one coming or going never overrides another: a resize, or the page coming
 * back into view, redraws the picture but never resumes a cave the viewer
 * paused.
 */

export interface Playback {
  /** Paused by the viewer, or because the device couldn't keep up. */
  paused: boolean;
  hidden: boolean;
  reducedMotion: boolean;
}

export type PlaybackEvent =
  | { type: "motion"; reduced: boolean }
  | { type: "pause" }
  | { type: "play" }
  | { type: "visibility"; hidden: boolean };

/** What the stage should be doing: running the animation, showing one still frame, or nothing. */
export type PlaybackMode = "animate" | "off" | "still";

export function playback(state: Playback, event: PlaybackEvent): Playback {
  if (event.type === "motion") return { ...state, reducedMotion: event.reduced };
  if (event.type === "visibility") return { ...state, hidden: event.hidden };
  return { ...state, paused: event.type === "pause" };
}

export function playbackMode({ paused, hidden, reducedMotion }: Playback): PlaybackMode {
  if (hidden) return "off";
  if (paused || reducedMotion) return "still";
  return "animate";
}
