type UiSound = "press" | "open" | "close" | "message" | "critical" | "failure";

let context: AudioContext | undefined;
let noise: AudioBuffer | undefined;
let lastImpact = -Infinity;
let lastTransition: { sound: "open" | "close"; time: number } | undefined;
let lastCritical: { sound: "critical" | "failure"; time: number } | undefined;

function audio() {
  if (!("AudioContext" in window)) return;
  context ??= new AudioContext();
  if (context.state !== "running") void context.resume().catch(() => {});
  return context;
}

function tone(
  sound: UiSound,
  startFrequency: number,
  endFrequency: number,
  startTime: number,
  duration: number,
  volume: number,
) {
  const current = audio();
  if (!current) return;
  const play = () => {
    const oscillator = current.createOscillator();
    const gain = current.createGain();
    const waveform = sound === "press" ? "triangle" : "sine";
    oscillator.type = waveform;
    oscillator.frequency.setValueAtTime(startFrequency, startTime);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, startTime + duration);
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    oscillator.connect(gain);
    gain.connect(current.destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.005);
  };
  if (current.state === "running") play();
  else
    void current
      .resume()
      .then(play)
      .catch(() => {});
}

export function playUiSound(sound: UiSound) {
  const current = audio();
  if (!current) return;
  const now = current.currentTime;
  const sounds: Record<UiSound, [number, number, number, number]> = {
    press: [760, 620, 0.035, 0.008],
    open: [460, 690, 0.09, 0.015],
    close: [620, 430, 0.075, 0.013],
    message: [690, 820, 0.11, 0.018],
    critical: [760, 1120, 0.15, 0.025],
    failure: [330, 175, 0.16, 0.02],
  };
  if (sound === "open" || sound === "close") {
    if (lastTransition?.sound === sound && now - lastTransition.time < 0.08) return;
    lastTransition = { sound, time: now };
  }
  if (sound === "critical" || sound === "failure") {
    if (lastCritical?.sound === sound && now - lastCritical.time < 0.12) return;
    lastCritical = { sound, time: now };
  }
  const [startFrequency, endFrequency, duration, volume] = sounds[sound];
  tone(sound, startFrequency, endFrequency, now, duration, volume);
  if (sound === "message") {
    tone(sound, 920, 1040, now + 0.07, 0.1, volume * 0.65);
  } else if (sound === "critical") {
    tone(sound, 1140, 1520, now + 0.04, 0.12, volume * 0.55);
  } else if (sound === "failure") {
    tone(sound, 230, 120, now + 0.03, 0.14, volume * 0.7);
  }
}

export function playDiceImpact(strength: number) {
  const current = audio();
  if (!current || current.state !== "running") return;

  const now = current.currentTime;
  if (now - lastImpact < 0.035) return;
  lastImpact = now;

  const intensity = Math.min(1, Math.max(0, strength / 12));
  if (!noise) {
    noise = current.createBuffer(1, Math.ceil(current.sampleRate * 0.05), current.sampleRate);
    const samples = noise.getChannelData(0);
    for (let index = 0; index < samples.length; index++) {
      samples[index] = (Math.random() * 2 - 1) * (1 - index / samples.length);
    }
  }

  const source = current.createBufferSource();
  source.buffer = noise;
  const filter = current.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(900 + intensity * 1800, now);
  const gain = current.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.025 + intensity * 0.08, now + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045 + intensity * 0.025);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(current.destination);
  source.start(now);
  source.stop(now + 0.075);

  const impactTone = current.createOscillator();
  const toneGain = current.createGain();
  impactTone.type = "triangle";
  impactTone.frequency.setValueAtTime(150 + intensity * 100, now);
  impactTone.frequency.exponentialRampToValueAtTime(65, now + 0.045);
  toneGain.gain.setValueAtTime(0.025 + intensity * 0.03, now);
  toneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
  impactTone.connect(toneGain);
  toneGain.connect(current.destination);
  impactTone.start(now);
  impactTone.stop(now + 0.055);
}

function activateAudio() {
  audio();
}

document.addEventListener("pointerdown", activateAudio, { capture: true });
document.addEventListener("keydown", activateAudio, { capture: true });

function openSurfaces() {
  return new Set<Element>([
    ...document.querySelectorAll("dialog[open], details[open]"),
    ...[...document.querySelectorAll<HTMLElement>("[popover]")].filter(
      (el) => !el.matches('.tooltip, [role="tooltip"]') && el.matches(":popover-open"),
    ),
  ]);
}

document.addEventListener(
  "click",
  (event) => {
    if (!(event.target instanceof Element)) return;
    const control = event.target.closest<HTMLElement>(
      'button, [role="button"], [role="menuitem"], input[type="button"], input[type="submit"]',
    );
    if (
      !control ||
      control.matches(":disabled, [aria-disabled='true'], [data-sound='off']") ||
      control.hasAttribute("aria-expanded") ||
      control.hasAttribute("aria-haspopup")
    )
      return;
    const before = openSurfaces();
    window.setTimeout(() => {
      const after = openSurfaces();
      if (before.size !== after.size || [...before].some((surface) => !after.has(surface))) return;
      playUiSound("press");
    }, 0);
  },
  { capture: true },
);

document.addEventListener(
  "toggle",
  (event) => {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      target.hasAttribute("popover") &&
      !target.matches('.tooltip, [role="tooltip"]')
    ) {
      playUiSound(target.matches(":popover-open") ? "open" : "close");
    }
  },
  true,
);

new MutationObserver((changes) => {
  for (const change of changes) {
    const target = change.target;
    if (!(target instanceof HTMLElement)) continue;
    if (change.attributeName === "aria-expanded") {
      const previous = change.oldValue;
      const current = target.getAttribute("aria-expanded");
      if ((previous === "true" || previous === "false") && current !== previous)
        playUiSound(current === "true" ? "open" : "close");
    } else if (target.matches("dialog, details")) {
      playUiSound(target.hasAttribute("open") ? "open" : "close");
    }
  }
}).observe(document.documentElement, {
  subtree: true,
  attributes: true,
  attributeOldValue: true,
  attributeFilter: ["aria-expanded", "open"],
});
