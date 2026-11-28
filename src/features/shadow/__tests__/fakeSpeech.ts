import type { SpeechAvailability } from "../../../platform/localSpeech";
import type { Speech } from "../voice";

/** On-device speech that hands over phrases when told to. */
// eslint-disable-next-line import/prefer-default-export -- named, like the rest of the app's modules
export class FakeSpeech implements Speech {
  onPhrase: ((text: string) => void) | null = null;
  installed = false;
  available: SpeechAvailability;

  constructor(available: SpeechAvailability = "available") {
    this.available = available;
  }

  availability = () => Promise.resolve(this.available);

  install = () => {
    this.installed = true;
    this.available = "available";
    return Promise.resolve(true);
  };

  listen: Speech["listen"] = (_lang, onPhrase, onEnd) => {
    this.onPhrase = onPhrase;
    return {
      stop: () => {
        this.onPhrase = null;
        onEnd();
      },
    };
  };

  say(text: string) {
    this.onPhrase?.(text);
  }
}
