/*
 * Speech recognition that runs on this device (the Web Speech API with
 * `processLocally`). Without on-device recognition it stays off: it never
 * falls back to the browser's cloud recognition, so what's said never leaves
 * this device. Browsers that predate `processLocally` count as unavailable,
 * since they can't promise it.
 */

export type SpeechAvailability = "available" | "downloadable" | "downloading" | "unavailable";

interface LocalOptions {
  langs: string[];
  processLocally: true;
}

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  addEventListener: {
    (type: "result", listener: (e: SpeechRecognitionEvent) => void): void;
    (type: "error", listener: (e: SpeechRecognitionErrorEvent) => void): void;
    (type: "end", listener: () => void): void;
  };
}

interface RecognitionStatic {
  new (): Recognition;
  available?: (options: LocalOptions) => Promise<SpeechAvailability>;
  install?: (options: LocalOptions) => Promise<boolean>;
}

declare global {
  /** Missing where the browser has no speech recognition; Chrome also has it prefixed. */
  // eslint-disable-next-line vars-on-top -- declares a global, not a variable
  var SpeechRecognition: RecognitionStatic | undefined;
  // eslint-disable-next-line vars-on-top -- declares a global, not a variable
  var webkitSpeechRecognition: RecognitionStatic | undefined;
}

const api = () => globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition;

const options = (lang: string): LocalOptions => ({ langs: [lang], processLocally: true });

/** Whether `lang` can be recognised on this device. */
export async function speechAvailability(lang: string): Promise<SpeechAvailability> {
  const sr = api();
  if (!sr?.available) return "unavailable";
  try {
    return await sr.available(options(lang));
  } catch {
    return "unavailable";
  }
}

/** Download on-device recognition for `lang`. Needs a user gesture. */
export async function installSpeech(lang: string): Promise<boolean> {
  const sr = api();
  if (!sr?.install) return false;
  try {
    return await sr.install(options(lang));
  } catch {
    return false;
  }
}

export interface Listening {
  stop: () => void;
}

/**
 * Listen to the microphone and hand each finished phrase to `onPhrase`.
 * Recognition stops by itself after a pause, so this restarts it until
 * `stop()`. `onEnd` is called once, with a reason, if it stops for good.
 */
export function listenLocally(
  lang: string,
  onPhrase: (text: string) => void,
  onEnd: (error?: string) => void,
): Listening {
  const Recognition = api();
  if (!Recognition?.available) throw new Error("This browser has no on-device speech recognition");
  let stopped = false;
  let r: Recognition;
  const begin = () => {
    r = new Recognition();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = false;
    r.processLocally = true;
    r.addEventListener("result", ({ results, resultIndex }) => {
      for (let i = resultIndex; i < results.length; i++) {
        const result = results[i]!;
        const text = result[0]?.transcript.trim();
        if (result.isFinal && text) onPhrase(text);
      }
    });
    r.addEventListener("error", ({ error }) => {
      // A quiet room isn't a reason to stop.
      if (error === "no-speech" || error === "aborted") return;
      stopped = true;
      onEnd(error);
    });
    r.addEventListener("end", () => {
      if (!stopped) begin();
    });
    r.start();
  };
  begin();
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      r.stop();
      onEnd();
    },
  };
}
