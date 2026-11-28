import { store } from "../../lib/store";
import { installSpeech, listenLocally, speechAvailability } from "../../platform/localSpeech";
import type { Listening } from "../../platform/localSpeech";

/*
 * Listening to the GM for the shadow: the GM's own microphone, transcribed on
 * this device. It only listens once the GM turns it on, and stops when they
 * turn it off or the shadow closes. Without on-device recognition it can't
 * be turned on at all.
 */

export type VoiceStatus =
  | { kind: "error"; message: string }
  | { kind: "installing" }
  | { kind: "listening" }
  | { kind: "off" }
  | { kind: "unavailable" };

/** The speech wrapper, as used here; tests pass a fake. */
export interface Speech {
  availability: typeof speechAvailability;
  install: typeof installSpeech;
  listen: typeof listenLocally;
}

const localSpeech: Speech = {
  availability: speechAvailability,
  install: installSpeech,
  listen: listenLocally,
};

const ERRORS: Record<string, string> = {
  "not-allowed": "Microphone access was refused",
  "audio-capture": "No microphone was found",
  "language-not-supported": "This language can't be recognised on this device",
};

export class ShadowVoice {
  readonly status = store<VoiceStatus>({ kind: "off" });
  readonly #onPhrase: (text: string) => void;
  readonly #speech: Speech;
  readonly #lang: string;
  #listening: Listening | null = null;
  /** Counts stops, so a start that was waiting knows it was turned off. */
  #stops = 0;

  constructor(
    onPhrase: (text: string) => void,
    { speech = localSpeech, lang = navigator.language || "en-US" } = {},
  ) {
    this.#onPhrase = onPhrase;
    this.#speech = speech;
    this.#lang = lang;
  }

  /** Whether on-device recognition is there or can be got; turns off the switch if not. */
  async check() {
    if ((await this.#speech.availability(this.#lang)) === "unavailable")
      this.status.value = { kind: "unavailable" };
  }

  /** Start listening, installing on-device recognition first if need be: call from a click. */
  async start() {
    if (this.#listening) return;
    const stops = this.#stops;
    const a = await this.#speech.availability(this.#lang);
    if (a === "unavailable") {
      this.status.value = { kind: "unavailable" };
      return;
    }
    if (a !== "available") {
      this.status.value = { kind: "installing" };
      if (!(await this.#speech.install(this.#lang))) {
        this.status.value = { kind: "error", message: "Couldn't set up on-device speech" };
        return;
      }
      // Turned off while it was setting up.
      if (this.#stops !== stops) return;
    }
    try {
      this.#listening = this.#speech.listen(this.#lang, this.#onPhrase, this.#ended);
      this.status.value = { kind: "listening" };
    } catch (error) {
      this.status.value = { kind: "error", message: String(error) };
    }
  }

  readonly #ended = (error?: string) => {
    this.#listening = null;
    this.status.value = error
      ? { kind: "error", message: ERRORS[error] ?? `Listening stopped (${error})` }
      : { kind: "off" };
  };

  stop() {
    this.#stops++;
    if (this.status.value.kind === "installing") this.status.value = { kind: "off" };
    this.#listening?.stop();
    this.#listening = null;
  }
}
