import { HybridClock } from "../../lib/hlc";
import { store } from "../../lib/store";
import type { ReadonlyStore } from "../../lib/store";
import { createModelSession, modelAvailability } from "../../platform/localAi";
import type { ModelAvailability, ModelSession } from "../../platform/localAi";
import type { ChatMessage } from "../chat/types";
import { chatLines, merged } from "./feed";
import type { Line } from "./feed";
import { addLogLine, briefing, folded, logLines, remember, shadowView } from "./memory";
import type { ShadowView } from "./memory";
import {
  ANALYSIS_SCHEMA,
  analysisPrompt,
  foldPrompt,
  readAnalysis,
  SYSTEM_PROMPT,
} from "./prompts";
import type { ShadowStore } from "./schema";
import { ShadowVoice } from "./voice";
import type { Speech } from "./voice";
import { foldCount } from "./window";

/*
 * The GM shadow: watches the session and, on the GM's device, asks Chrome's
 * on-device model for complications, the people and places that come up, and
 * plot threads. It reads the session through `ShadowSource`, which has no
 * way to write to it, and writes only to its memory in the GM vault, so
 * nothing it makes can reach a player. The model runs on this device, so
 * nothing it reads leaves it.
 */

export interface ShadowSource {
  /** The GM's device id: the shadow reads only what this device sees. */
  readonly gm: string;
  readonly messages: ReadonlyStore<readonly ChatMessage[]>;
  /** Whose turn it is, as a line ("Round 2: Goblin's turn"), or null outside combat. */
  readonly turn: ReadonlyStore<string | null>;
  /** Stop whatever keeps the source current. */
  close?: () => void;
}

/** The on-device model, as the shadow uses it; tests pass a fake. */
export interface ShadowModel {
  availability: () => Promise<ModelAvailability>;
  create: (
    system: string,
    options: { onProgress: (loaded: number) => void; signal: AbortSignal },
  ) => Promise<ModelSession>;
}

/** What tests swap in for the device's own model and speech. */
export interface ShadowOptions {
  model?: ShadowModel;
  speech?: Speech;
}

const localModel: ShadowModel = { availability: modelAvailability, create: createModelSession };

/**
 * Where the shadow is: "downloadable" means the model needs downloading,
 * which needs a click; "ready" means it can run, and is watching if
 * `watching` is on.
 */
export type ShadowStatus =
  | { kind: "checking" }
  | { kind: "downloadable" }
  | { kind: "downloading"; progress: number }
  | { kind: "error"; message: string }
  | { kind: "ready" }
  | { kind: "thinking" }
  | { kind: "unavailable" };

const STATUS_FOR: Record<ModelAvailability, ShadowStatus> = {
  available: { kind: "ready" },
  downloadable: { kind: "downloadable" },
  downloading: { kind: "downloadable" },
  unavailable: { kind: "unavailable" },
};

/** Wait this long after the table goes quiet before looking. */
const SETTLE_MS = 20_000;
/** Look straight away once this many lines are waiting. */
const EAGER_LINES = 12;
/** Room kept for the summary as it grows, and for the reply. */
const SUMMARY_RESERVE = 400;
const REPLY_RESERVE = 600;
/** A cautious guess at token counts, if the model can't measure them. */
const CHARS_PER_TOKEN = 3;

export class Shadow {
  readonly status = store<ShadowStatus>({ kind: "checking" });
  /** Whether it's following the session. Off until the GM turns it on. */
  readonly watching = store(false);
  /** The GM's microphone, off until they turn it on. */
  readonly voice: ShadowVoice;
  /** What it remembers, kept current. */
  readonly view: ReadonlyStore<ShadowView>;
  readonly #source: ShadowSource;
  readonly #memory: ShadowStore;
  readonly #model: ShadowModel;
  readonly #clock: HybridClock;
  readonly #abort = new AbortController();
  readonly #costs = new Map<string, number>();
  readonly #stops: (() => void)[] = [];
  #base: ModelSession | null = null;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #running: Promise<void> | null = null;
  /** Counts asks to look while a look was running. */
  #asked = 0;

  constructor(
    source: ShadowSource,
    memory: ShadowStore,
    { model = localModel, speech }: ShadowOptions = {},
  ) {
    this.voice = new ShadowVoice(
      (text) => {
        this.hear(text);
      },
      speech ? { speech } : {},
    );
    this.#source = source;
    this.#memory = memory;
    this.#model = model;
    this.#clock = new HybridClock(source.gm);
    const view = store(shadowView(memory));
    this.view = view;
    const refresh = () => {
      view.value = shadowView(memory);
    };
    this.#stops.push(
      ...[
        memory.shadowState,
        memory.shadowLog,
        memory.shadowFacts,
        memory.shadowThreads,
        memory.shadowIdeas,
      ].map((part) => part.observe(refresh)),
      source.messages.subscribe(() => {
        this.#changed();
      }),
      source.turn.subscribe(() => {
        const turn = source.turn.value;
        if (turn && this.watching.value) this.#log(turn, "combat");
      }),
    );
  }

  /** Find out whether the model can run here. */
  async check() {
    const a = await this.#model.availability();
    if (this.#abort.signal.aborted || this.status.value.kind !== "checking") return;
    this.status.value = STATUS_FOR[a];
  }

  /** Start watching, downloading the model first if need be: call from a click. */
  async begin() {
    this.watching.value = true;
    try {
      await this.#session();
    } catch (error) {
      this.watching.value = false;
      this.#fail(error);
      return;
    }
    this.#changed();
  }

  pause() {
    this.watching.value = false;
    clearTimeout(this.#timer);
  }

  /** Something the GM said, to read with the rest. */
  hear(text: string) {
    this.#log(`GM (aloud): ${text}`, "voice");
    this.#changed();
  }

  /** Look at what's new now, rather than waiting for the table to settle. */
  async think(): Promise<void> {
    clearTimeout(this.#timer);
    if (!this.watching.value) return;
    if (this.#running) {
      // Look again once this look is done, at whatever came in meanwhile.
      this.#asked++;
      await this.#running;
      return;
    }
    this.#running = this.#look();
    await this.#running;
  }

  async #look() {
    const asked = this.#asked;
    try {
      await this.#pass();
      if (this.status.value.kind === "thinking") this.status.value = { kind: "ready" };
    } catch (error) {
      this.#fail(error);
    } finally {
      this.#running = null;
    }
    if (this.#asked !== asked) await this.think();
  }

  destroy() {
    this.pause();
    this.voice.stop();
    this.#abort.abort();
    for (const stop of this.#stops) stop();
    this.#source.close?.();
    this.#base?.destroy();
    this.#base = null;
  }

  #log(text: string, source: "combat" | "voice") {
    const last = this.#source.messages.value.at(-1);
    if (last) this.#clock.receive(last.hlc);
    addLogLine(this.#memory, { at: this.#clock.tick(), text }, source);
  }

  #fail(error: unknown) {
    if (this.#abort.signal.aborted) return;
    const message = error instanceof Error ? error.message : String(error);
    console.error("GM shadow:", error);
    this.status.value = { kind: "error", message };
  }

  async #session(): Promise<ModelSession> {
    if (this.#base) return this.#base;
    if (this.status.value.kind === "downloadable" || this.status.value.kind === "checking")
      this.status.value = { kind: "downloading", progress: 0 };
    this.#base = await this.#model.create(SYSTEM_PROMPT, {
      signal: this.#abort.signal,
      onProgress: (progress) => {
        if (this.status.value.kind === "downloading")
          this.status.value = { kind: "downloading", progress };
      },
    });
    this.status.value = { kind: "ready" };
    return this.#base;
  }

  /** Every line after the summary, in order. */
  #window(): Line[] {
    const after = this.#memory.shadowState.get("foldedThrough");
    return merged(
      chatLines(this.#source.messages.value, this.#source.gm, after),
      logLines(this.#memory, after),
    );
  }

  #fresh(lines: Line[]): Line[] {
    const read = this.#memory.shadowState.get("readThrough");
    return lines.filter((l) => l.at > read);
  }

  #changed() {
    if (!this.watching.value || !this.#base) return;
    clearTimeout(this.#timer);
    if (this.#fresh(this.#window()).length >= EAGER_LINES) void this.think();
    else
      this.#timer = setTimeout(() => {
        void this.think();
      }, SETTLE_MS);
  }

  async #ask(prompt: string, constrained: boolean): Promise<string> {
    const base = await this.#session();
    const s = await base.clone({ signal: this.#abort.signal });
    try {
      return await s.prompt(prompt, {
        signal: this.#abort.signal,
        ...(constrained
          ? { responseConstraint: ANALYSIS_SCHEMA, omitResponseConstraintInput: true }
          : {}),
      });
    } finally {
      s.destroy();
    }
  }

  async #cost(text: string): Promise<number> {
    const known = this.#costs.get(text);
    if (known !== undefined) return known;
    let cost: number;
    try {
      cost = await this.#base!.measureContextUsage(`${text}\n`, { signal: this.#abort.signal });
    } catch {
      cost = Math.ceil(text.length / CHARS_PER_TOKEN);
    }
    this.#costs.set(text, cost);
    return cost;
  }

  /** What's left of the context window for session lines. */
  async #budget(prompt: string): Promise<number> {
    const base = await this.#session();
    const free = base.contextWindow - base.contextUsage;
    return free - (await this.#cost(prompt)) - SUMMARY_RESERVE - REPLY_RESERVE;
  }

  async #pass() {
    let lines = this.#window();
    if (this.#fresh(lines).length === 0) return;
    this.status.value = { kind: "thinking" };
    const empty = analysisPrompt({ ...briefing(this.#memory), summary: "" }, [], []);
    const [budget, costs] = await Promise.all([
      this.#budget(empty),
      Promise.all(lines.map(async (l) => this.#cost(l.text))),
    ]);
    const fold = foldCount(costs, budget);
    if (fold > 0) {
      await this.#fold(lines.slice(0, fold), costs.slice(0, fold));
      lines = lines.slice(fold);
    }
    const fresh = this.#fresh(lines);
    if (fresh.length === 0) return;
    const earlier = lines.slice(0, lines.length - fresh.length);
    const reply = await this.#ask(analysisPrompt(briefing(this.#memory), earlier, fresh), true);
    remember(this.#memory, fresh, readAnalysis(reply));
  }

  /** Fold `lines` into the summary, a context window's worth at a time. */
  async #fold(lines: Line[], costs: number[]) {
    const budget = await this.#budget(foldPrompt("", []));
    let start = 0;
    while (start < lines.length) {
      let end = start + 1;
      let used = costs[start]!;
      while (end < lines.length && used + costs[end]! <= budget) used += costs[end++]!;
      const chunk = lines.slice(start, end);
      // Each chunk folds into the summary the last one made.
      // eslint-disable-next-line no-await-in-loop
      const summary = await this.#ask(
        foldPrompt(this.#memory.shadowState.get("summary"), chunk),
        false,
      );
      folded(this.#memory, summary.trim(), chunk.at(-1)!.at);
      start = end;
    }
  }
}
