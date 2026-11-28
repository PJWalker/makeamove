/*
 * Chrome's built-in language model (the Prompt API's `LanguageModel`, Gemini
 * Nano). It runs on this device, so nothing sent to it leaves it. Other
 * browsers, and devices that can't run it, don't have it: callers check
 * `modelAvailability()` and carry on without.
 *
 * The API is still changing, so this declares only what's used here, by its
 * current names (contextUsage/contextWindow, not inputUsage/inputQuota).
 */

export type ModelAvailability = "available" | "downloadable" | "downloading" | "unavailable";

type Role = "assistant" | "system" | "user";

interface ModelIo {
  type: "text";
  languages: string[];
}

interface DownloadMonitor {
  addEventListener: (type: "downloadprogress", listener: (e: ProgressEvent) => void) => void;
}

interface CreateOptions {
  initialPrompts?: { role: Role; content: string }[];
  expectedInputs?: ModelIo[];
  expectedOutputs?: ModelIo[];
  signal?: AbortSignal;
  monitor?: (m: DownloadMonitor) => void;
}

interface PromptOptions {
  responseConstraint?: object;
  omitResponseConstraintInput?: boolean;
  signal?: AbortSignal;
}

/** A conversation with the model; `clone` starts a fresh one from its initial prompts. */
export interface ModelSession {
  prompt: (input: string, options?: PromptOptions) => Promise<string>;
  measureContextUsage: (input: string, options?: { signal?: AbortSignal }) => Promise<number>;
  clone: (options?: { signal?: AbortSignal }) => Promise<ModelSession>;
  destroy: () => void;
  readonly contextUsage: number;
  readonly contextWindow: number;
}

interface LanguageModelStatic {
  availability: (options?: CreateOptions) => Promise<ModelAvailability>;
  create: (options?: CreateOptions) => Promise<ModelSession>;
}

const IO: CreateOptions = {
  expectedInputs: [{ type: "text", languages: ["en"] }],
  expectedOutputs: [{ type: "text", languages: ["en"] }],
};

declare global {
  /** Missing where the browser has no built-in model. */
  // eslint-disable-next-line vars-on-top -- declares a global, not a variable
  var LanguageModel: LanguageModelStatic | undefined;
}

const api = () => globalThis.LanguageModel;

/** Whether the on-device model can run here, needs downloading, or can't run at all. */
export async function modelAvailability(): Promise<ModelAvailability> {
  const lm = api();
  if (!lm) return "unavailable";
  try {
    return await lm.availability(IO);
  } catch {
    return "unavailable";
  }
}

/**
 * Start a session, downloading the model first if it isn't here yet. A
 * download needs a user gesture, so call this from a click when
 * `modelAvailability()` is "downloadable". `onProgress` gets 0–1.
 */
export async function createModelSession(
  system: string,
  { onProgress, signal }: { onProgress?: (loaded: number) => void; signal?: AbortSignal } = {},
): Promise<ModelSession> {
  const lm = api();
  if (!lm) throw new Error("This browser has no on-device language model");
  return lm.create({
    ...IO,
    initialPrompts: [{ role: "system", content: system }],
    ...(signal ? { signal } : {}),
    monitor(m) {
      m.addEventListener("downloadprogress", (e) => {
        onProgress?.(e.loaded);
      });
    },
  });
}
