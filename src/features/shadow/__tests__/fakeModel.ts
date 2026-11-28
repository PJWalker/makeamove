import type { ModelAvailability, ModelSession } from "../../../platform/localAi";
import type { ShadowModel } from "../shadow";

/** Roughly how many characters make a token, for the fake's context usage. */
const CHARS_PER_TOKEN = 4;
const SYSTEM_PROMPT_TOKENS = 50;
const HALFWAY = 0.5;
const DOWNLOAD_STEPS = [0, HALFWAY, 1];
const CONTEXT_WINDOW = 4096;

/** An on-device model that answers from a script, and remembers what it was asked. */
// eslint-disable-next-line import/prefer-default-export -- named, like the rest of the app's modules
export class FakeModel implements ShadowModel {
  readonly prompts: string[] = [];
  reply = JSON.stringify({ ideas: [], facts: [], threads: [] });
  summary = "A summary.";
  available: ModelAvailability;
  contextWindow: number;

  constructor(available: ModelAvailability = "available", contextWindow = CONTEXT_WINDOW) {
    this.available = available;
    this.contextWindow = contextWindow;
  }

  availability = () => Promise.resolve(this.available);

  create: ShadowModel["create"] = (_system, { onProgress }) => {
    if (this.available === "unavailable") return Promise.reject(new Error("unavailable"));
    if (this.available !== "available") {
      for (const step of DOWNLOAD_STEPS) onProgress(step);
      this.available = "available";
    }
    return Promise.resolve(this.#session());
  };

  #session(): ModelSession {
    return {
      contextUsage: SYSTEM_PROMPT_TOKENS,
      contextWindow: this.contextWindow,
      prompt: (input, options) => {
        this.prompts.push(input);
        return Promise.resolve(options?.responseConstraint ? this.reply : this.summary);
      },
      measureContextUsage: (input) => Promise.resolve(Math.ceil(input.length / CHARS_PER_TOKEN)),
      clone: () => Promise.resolve(this.#session()),
      destroy: () => undefined,
    };
  }
}
