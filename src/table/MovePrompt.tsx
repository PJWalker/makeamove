import { FormattedText } from "./FormattedText";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { watch } from "../lib/store";
import {
  getCharacter,
  makeMove,
  moveRequest,
  startMove,
  systemOf,
  targetRequest,
} from "../features/characters/api";
import {
  canPayMove,
  checkOf,
  needsChoice,
  planMove,
  rollModesFor,
  saveOf,
} from "../features/characters/moves";
import { derive } from "../features/characters/store";
import { inRange } from "../scene/measure";
import { activeTool } from "../scene/tools";
import type { Campaign } from "../campaign/campaign";
import { collapsedInto, reducedMotion } from "../ui/bubble";
import { Button } from "../ui/Button";
import { IconClose } from "../ui/icons";
import { lastPressed } from "../ui/pressed";
import { Segmented } from "../ui/Segmented";
import { areaRequest, chosenTargets, placedArea, sceneDistance, targetPick } from "./canvasState";
import { useValue } from "../ui/useValue";
import type { ActionDef, AreaSpec } from "../systems/types";
import type { MoveTarget } from "../features/chat/types";

/*
 * What a move asks before it rolls, in a speech bubble beside the button that
 * started it (a sheet's roll, a hotbar slot, a move's glyph): first its
 * targets, picked on the map, then any stat, number, roll mode (advantage)
 * and extra bonus, with the formula as it will roll. The bubble grows out of
 * that button and shrinks back into it, like a chat popup out of the Chat
 * tab, but quicker, since the user asked for it. It follows the button as
 * sidebars slide; without one on screen it sits above the hotbar.
 */

const ENTER_MS = 150;
const LEAVE_MS = 110;
const EASE = "cubic-bezier(0.2, 0.7, 0.2, 1)";
/** Between the button and the bubble, room for the tail. */
const GAP = 14;
/** The closest the bubble comes to the window's edges. */
const MARGIN = 8;
/** A button this close to the bottom (the hotbar) gets the bubble above it. */
const BOTTOM_BAND = 120;

type Request = { kind: "target" | "ask"; moveId: string; characterId: string };

const cancel = () => {
  targetRequest.value = null;
  moveRequest.value = null;
  areaRequest.value = null;
};

/** The anchor's box, if it's still on screen. */
function anchorRect(el: Element | null): DOMRect | null {
  const r = el?.isConnected ? el.getBoundingClientRect() : null;
  return r &&
    r.width > 0 &&
    r.right > 0 &&
    r.left < innerWidth &&
    r.bottom > 0 &&
    r.top < innerHeight
    ? r
    : null;
}

export function MovePrompt({ campaign }: { campaign: Campaign }) {
  const target = useValue(targetRequest);
  const requestedMove = useValue(moveRequest);
  const live: Request | null = useMemo(
    () =>
      target
        ? { kind: "target", ...target }
        : requestedMove
          ? { kind: "ask", ...requestedMove }
          : null,
    [target, requestedMove],
  );
  const hasLive = live !== null;
  // What's on screen: the live request, or the last one while it shrinks away.
  const [shown, setShown] = useState<Request | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const anchor = useRef<Element | null>(null);
  const leaving = useRef<Animation | null>(null);

  // A new request takes the button just pressed as its anchor, unless that was in the bubble (targets → roll).
  useLayoutEffect(() => {
    if (!live) return;
    const pressed = lastPressed();
    if (pressed && !ref.current?.contains(pressed)) anchor.current = pressed;
    else if (!shown) anchor.current = null;
    leaving.current?.cancel();
    leaving.current = null;
    setShown(live);
  }, [live, shown]);

  // Shrink back into the button once the request is done or cancelled.
  useLayoutEffect(() => {
    if (hasLive || !shown) return;
    const el = ref.current;
    if (!el || reducedMotion.matches) {
      setShown(null);
      return;
    }
    const box = el.getBoundingClientRect();
    const a = el.animate(
      [
        { transform: getComputedStyle(el).transform, opacity: 1 },
        collapsedInto(box, anchorRect(anchor.current)),
      ],
      {
        duration: LEAVE_MS,
        easing: "ease-in",
        fill: "forwards",
      },
    );
    leaving.current = a;
    a.finished.then(
      () => {
        if (leaving.current === a) setShown(null);
      },
      () => {},
    );
  }, [hasLive, shown]);

  // Beside the button: to whichever side has room, or above it in the bottom band; without it, above the hotbar.
  const placed = useRef("");
  const place = () => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const a = anchorRect(anchor.current);
    const clampX = (x: number) =>
      Math.round(Math.min(Math.max(x, MARGIN), innerWidth - w - MARGIN));
    const clampY = (y: number) =>
      Math.round(Math.min(Math.max(y, MARGIN), innerHeight - h - MARGIN));
    let side: string, left: number, top: number, tail: number;
    if (!a) {
      side = "none";
      left = clampX((innerWidth - w) / 2);
      top = clampY(innerHeight - h - 60);
      tail = 0;
    } else if (a.top > innerHeight - BOTTOM_BAND) {
      side = "above";
      left = clampX(a.left + a.width / 2 - w / 2);
      top = clampY(a.top - GAP - h);
      tail = Math.round(a.left + a.width / 2 - left);
    } else {
      const right =
        innerWidth - a.right - GAP - MARGIN >= w || a.left + a.width / 2 < innerWidth / 2;
      side = right ? "right" : "left";
      left = clampX(right ? a.right + GAP : a.left - GAP - w);
      top = clampY(a.top + a.height / 2 - h / 2);
      tail = Math.round(a.top + a.height / 2 - top);
    }
    const key = `${side},${left},${top},${tail}`;
    if (key === placed.current) return;
    placed.current = key;
    el.dataset.side = side;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.setProperty("--tail", `${tail}px`);
  };

  const open = !!shown;
  // Grow out of the button, then follow it while open: it slides with its sidebar and with autohide.
  useLayoutEffect(() => {
    if (!open) {
      placed.current = "";
      return;
    }
    place();
    const el = ref.current;
    if (el && !reducedMotion.matches) {
      const box = el.getBoundingClientRect();
      el.animate(
        [
          collapsedInto(box, anchorRect(anchor.current)),
          { opacity: 1, offset: 0.4 },
          { transform: "none", opacity: 1 },
        ],
        {
          duration: ENTER_MS,
          easing: EASE,
        },
      );
    }
    let frame = 0;
    const follow = () => {
      place();
      frame = requestAnimationFrame(follow);
    };
    frame = requestAnimationFrame(follow);
    return () => cancelAnimationFrame(frame);
  }, [open]);

  // Hand a targeting request to the scene, so clicks on tokens target it.
  useEffect(
    () =>
      watch([targetRequest], () => {
        const r = targetRequest.value;
        const s = r && systemOf(campaign).actions.find((m) => m.id === r.moveId)?.target;
        targetPick.value =
          r && s ? { ...(s.max !== undefined ? { max: s.max } : {}), actor: r.characterId } : null;
        if (r) activeTool.value = "select";
      }),
    [campaign],
  );
  useEffect(() => () => cancel(), []);

  // Escape backs out, before the canvas uses it to clear the selection.
  useEffect(() => {
    if (!hasLive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      cancel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [hasLive]);

  const req = shown;
  const move = req ? systemOf(campaign).actions.find((m) => m.id === req.moveId) : undefined;
  const c = req ? getCharacter(campaign, req.characterId) : undefined;
  if (!req || !move || !c) return null;

  return (
    <div
      ref={ref}
      className="roll-prompt panel"
      role="dialog"
      aria-label={`${move.name} (${c.name})`}
      inert={!hasLive}
    >
      <div className="roll-prompt-head">
        <span className="eyebrow">
          {move.name} · {c.name}
        </span>
        <Button variant="icon" size="sm" label="Cancel" onClick={cancel}>
          <IconClose />
        </Button>
      </div>
      <FormattedText
        campaign={campaign}
        text={withoutAskedQuestions(move)}
        characterId={c.id}
        className="roll-prompt-desc"
      />
      {req.kind === "target" ? (
        <TargetStep campaign={campaign} characterId={c.id} moveId={move.id} />
      ) : (
        <AskStep
          key={`${c.id}:${move.id}`}
          campaign={campaign}
          characterId={c.id}
          moveId={move.id}
        />
      )}
      <span className="roll-prompt-tail" aria-hidden="true" />
    </div>
  );
}

/** Targets, picked by clicking tokens on the map. */
function TargetStep({
  campaign,
  characterId,
  moveId,
}: {
  campaign: Campaign;
  characterId: string;
  moveId: string;
}) {
  const move = systemOf(campaign).actions.find((m) => m.id === moveId)!;
  const spec = move.target!;
  const targets = useValue(chosenTargets);
  const ready = targets.length >= spec.min;
  const fmt = useValue(sceneDistance);
  const wanted =
    spec.max === 1
      ? "one target"
      : spec.max
        ? `up to ${spec.max} targets`
        : "any number of targets";
  const reach = (d: number | null) =>
    spec.range && d !== null ? inRange(d, spec.range) : "normal";
  const blocked = targets.some((t) => reach(t.distance) === "out");
  const go = () => {
    if (!ready || blocked) return;
    const picked: MoveTarget[] = targets.map((t) => ({
      id: t.id,
      name: t.name,
      ...(t.characterId ? { characterId: t.characterId } : {}),
      ...(t.distance !== null ? { distance: fmt(t.distance) } : {}),
      ...(reach(t.distance) === "long" ? { long: true } : {}),
    }));
    startMove(campaign, characterId, move, picked);
  };
  const area = spec.area;
  const request = useValue(areaRequest);
  const placed = useValue(placedArea);
  const placing = !!request;
  const placeArea = () =>
    (areaRequest.value = placing ? null : { area: area!, actor: characterId, n: Date.now() });
  return (
    <div className="move-form">
      <p className="roll-prompt-text">{spec.prompt}</p>
      {area && (
        <Button
          size="sm"
          variant={placed ? "ghost" : "secondary"}
          pressed={placing}
          onClick={placeArea}
        >
          {placing
            ? "Click the map to place it"
            : placed
              ? "Place the area again"
              : `Place the ${areaName(area)}`}
        </Button>
      )}
      {targets.length ? (
        <span className="roll-prompt-targets">
          {targets.map((t) => {
            const r = reach(t.distance);
            const out = r === "out";
            return (
              <span
                key={t.id}
                className="target-chip"
                data-out={out || undefined}
                title={out ? "Out of range" : r === "long" ? "Long range" : undefined}
              >
                {t.name}
                {t.distance !== null && <span className="muted"> {fmt(t.distance)}</span>}
              </span>
            );
          })}
        </span>
      ) : (
        <span className="muted">
          {area ? "Place the area, or click" : "Click"} a token on the map: {wanted}.
        </span>
      )}
      <Button variant="primary" disabled={!ready || blocked} onClick={go}>
        {blocked ? "Out of Range" : move.name}
      </Button>
    </div>
  );
}

/** An area as the button names it: "20 ft sphere". */
const areaName = (a: AreaSpec) => `${sceneDistance.value(a.size)} ${a.shape}`;

/** A formula without its labels, as the Roll button reads: 1d20+2[Prof] → 1d20+2. */
const bare = (formula: string) => formula.replace(/\[[^\]]*\]/g, "");

/** A move's text without the list of questions the prompt asks as checkboxes below it. */
function withoutAskedQuestions(move: ActionDef) {
  const ask = needsChoice(move);
  if (ask?.kind !== "questions") return move.text;
  return move.text
    .split("\n")
    .filter((line) => {
      const item = /^\s*[-*]\s+(.*)$/.exec(line)?.[1];
      return !item || !ask.questions.includes(item.replace(/[*_]/g, "").trim());
    })
    .join("\n");
}

/** The stat or number the check needs and an extra bonus, then a Roll for each roll mode (disadvantage, roll, advantage). */
function AskStep({
  campaign,
  characterId,
  moveId,
}: {
  campaign: Campaign;
  characterId: string;
  moveId: string;
}) {
  const system = systemOf(campaign);
  const move = system.actions.find((m) => m.id === moveId)!;
  const c = getCharacter(campaign, characterId)!;
  const targets = moveRequest.value?.targets;
  const [stat, setStat] = useState("");
  const ask = needsChoice(move);
  const check = checkOf(move);
  const difficultySource = check?.difficulty ?? saveOf(move)?.difficulty;
  const unknownDefense =
    difficultySource?.kind === "target" &&
    targets?.some((target) => {
      const character = getCharacter(campaign, target.characterId);
      return !character || derive(character, system).values[difficultySource.value] === undefined;
    });
  const difficultySpec =
    difficultySource?.kind === "prompt"
      ? difficultySource
      : unknownDefense
        ? { prompt: "Difficulty for targets with unknown defense", initial: 10, min: 0, max: 99 }
        : undefined;
  const counterSpec = checkOf(move)?.counter;
  const rollBonusSpecs = checkOf(move)?.rollBonuses ?? [];
  const counters = campaign.chat.messages.value.filter((message) => message.kind === "counter");
  const [difficulty, setDifficulty] = useState(String(difficultySpec?.initial ?? 10));
  const [counterMessageId, setCounterMessageId] = useState(counters[0]?.id ?? "");
  const [rollBonuses, setRollBonuses] = useState<string[]>([]);
  const [askedNumber, setAskedNumber] = useState(ask?.kind === "number" ? (ask.initial ?? 1) : 1);
  const [yeses, setYeses] = useState<string[]>([]);
  const [extra, setExtra] = useState(moveRequest.value?.choice?.extra ?? 0);
  const [variant, setVariant] = useState("");
  const variants = move.variants?.(c, derive(c, system));
  const rollModes = check ? rollModesFor(system, move) : [];
  const formRef = useRef<HTMLFormElement>(null);
  // Enter rolls straight away.
  useEffect(
    () =>
      formRef.current
        ?.querySelector<HTMLButtonElement>('button[type="submit"]')
        ?.focus({ preventScroll: true }),
    [],
  );

  const chosenDifficulty = difficulty.trim() ? Number(difficulty) : undefined;
  const difficultyReady =
    !difficultySpec ||
    (chosenDifficulty !== undefined &&
      Number.isFinite(chosenDifficulty) &&
      chosenDifficulty >= (difficultySpec.min ?? 0) &&
      chosenDifficulty <= (difficultySpec.max ?? 99));
  const choiceWith = (mode: string) => ({
    stat: stat || undefined,
    ask: ask?.kind === "questions" ? yeses.length : askedNumber,
    extra: extra,
    mode: mode || undefined,
    difficulty: difficultySpec ? chosenDifficulty : undefined,
    counterMessageId: counterSpec ? counterMessageId : undefined,
    rollBonuses: rollBonuses,
    variant: variant || undefined,
  });
  const optionsReady =
    (ask?.kind !== "stat" || !!stat) && (!counterSpec || !!counterMessageId) && difficultyReady;
  const rollFor = (mode: string) => {
    const plan = planMove(system, move, c, derive(c, system), choiceWith(mode));
    return { formula: plan.formula, ready: optionsReady && canPayMove(c, plan) };
  };
  const go = (mode: string) => {
    if (!rollFor(mode).ready) return;
    void makeMove(campaign, c.id, move, choiceWith(mode), targets);
    moveRequest.value = null;
  };
  // The first half of the modes before the plain roll, the rest after: Disadvantage, Roll, Advantage.
  const half = Math.floor(rollModes.length / 2);
  const rollButton = (mode: string, label: string) => {
    const { formula, ready } = rollFor(mode);
    return (
      <Button
        key={mode}
        variant={mode ? "secondary" : "primary"}
        // The plain roll submits, so Enter makes it; the modes are clicked.
        type={mode ? "button" : "submit"}
        disabled={!ready}
        title={ready ? bare(formula) : undefined}
        onClick={mode ? () => go(mode) : undefined}
      >
        {label}
      </Button>
    );
  };

  return (
    <form
      ref={formRef}
      className="move-form"
      onSubmit={(e) => {
        e.preventDefault();
        go("");
      }}
    >
      {variants && (
        <label className="field">
          Casting or use
          <select
            value={variant || variants[0]?.id || ""}
            disabled={!variants.length}
            onChange={(event) => setVariant(event.currentTarget.value)}
          >
            {!variants.length && <option value="">No available uses</option>}
            {variants.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {ask?.kind === "stat" && (
        <Segmented
          label="Stat to roll"
          value={stat}
          options={system.stats.map((s) => ({ id: s.id, label: s.abbr, title: s.name }))}
          onChange={setStat}
        />
      )}
      {ask?.kind === "number" && (
        <label className="field">
          {ask.prompt}
          <input
            type="number"
            required
            min={ask.min}
            max={ask.max}
            value={askedNumber}
            onInput={(e) => setAskedNumber(Number(e.currentTarget.value) || 0)}
          />
        </label>
      )}
      {ask?.kind === "questions" && (
        <fieldset className="move-questions">
          <legend>{ask.prompt}</legend>
          {ask.questions.map((question) => (
            <label key={question} className="check-option">
              <input
                type="checkbox"
                checked={yeses.includes(question)}
                onChange={(e) =>
                  setYeses(
                    e.currentTarget.checked
                      ? [...yeses, question]
                      : yeses.filter((q) => q !== question),
                  )
                }
              />
              {question}
            </label>
          ))}
        </fieldset>
      )}
      {difficultySpec && (
        <label className="field">
          {difficultySpec.prompt}
          <input
            type="number"
            required
            min={difficultySpec.min ?? 0}
            max={difficultySpec.max ?? 99}
            value={difficulty}
            onInput={(e) => setDifficulty(e.currentTarget.value)}
          />
        </label>
      )}
      {counterSpec && (
        <label className="field">
          {counterSpec.prompt}
          <select
            value={counterMessageId}
            disabled={!counters.length}
            onChange={(e) => setCounterMessageId(e.currentTarget.value)}
          >
            <option value="">Choose a counter</option>
            {counters.map((counter) =>
              counter.kind === "counter" ? (
                <option key={counter.id} value={counter.id}>
                  {counter.label} ({counter.start}
                  {counter.max !== undefined ? `/${counter.max}` : ""})
                </option>
              ) : null,
            )}
          </select>
          {!counters.length && (
            <span className="muted">Create a track with /clock or /count first.</span>
          )}
        </label>
      )}
      {rollBonusSpecs
        .filter((bonus) => !bonus.nameField || String(c.data[bonus.nameField] ?? "").trim())
        .map((bonus) => {
          const selected = rollBonuses.includes(bonus.id);
          return (
            <label key={bonus.id} className="check-option">
              <input
                type="checkbox"
                checked={selected}
                disabled={
                  !selected &&
                  !!bonus.cost &&
                  (c.resources[bonus.cost.resource] ?? 0) < bonus.cost.by
                }
                onChange={() =>
                  setRollBonuses(
                    selected
                      ? rollBonuses.filter((id) => id !== bonus.id)
                      : [...rollBonuses, bonus.id],
                  )
                }
              />
              {bonus.nameField ? c.data[bonus.nameField] : bonus.label} (+
              {Number(c.data[bonus.valueField] ?? 0)};{" "}
              {bonus.cost ? `spend ${bonus.cost.by} ${bonus.cost.resource}` : "no cost"})
            </label>
          );
        })}
      {check && (
        <label className="field roll-prompt-extra">
          Extra bonus
          <input
            type="number"
            min={-10}
            max={10}
            value={extra}
            onInput={(e) => setExtra(Number(e.currentTarget.value) || 0)}
          />
        </label>
      )}
      {check ? (
        <div className="roll-buttons">
          {rollModes.slice(0, half).map((m) => rollButton(m.id, m.label))}
          {rollButton("", system.defaultRollLabel ?? "Roll")}
          {rollModes.slice(half).map((m) => rollButton(m.id, m.label))}
        </div>
      ) : (
        <Button variant="primary" type="submit" disabled={!rollFor("").ready}>
          Use
        </Button>
      )}
    </form>
  );
}
