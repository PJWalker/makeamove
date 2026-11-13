import { emptyRichText, plainText, type RichText } from "../data/richText";
import { RichTextView } from "../workspace/RichTextView";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { arrow, autoUpdate, computePosition, flip, offset, shift } from "@floating-ui/dom";
import { watch } from "../lib/store";
import { getCharacter, systemOf } from "../features/characters/api";
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
import type { Campaign } from "../campaign/campaign";
import { collapsedInto, reducedMotion } from "../ui/bubble";
import { Button } from "../ui/Button";
import { IconClose } from "../ui/icons";
import { lastPressed } from "../ui/pressed";
import { Segmented } from "../ui/Segmented";
import { useQuery } from "../ui/useQuery";
import type { ActionDef, AreaSpec } from "../systems/types";
import type { MoveTarget } from "../features/chat/types";
import { useCampaign } from "../workspace/campaignContext";
import type { CanvasState } from "../workspace/canvasState";
import type { CampaignContext } from "../workspace/campaignContext";
import { makeMove, startMove } from "../workspace/commands/characters";

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

const cancel = (ctx: CampaignContext) => {
  ctx.campaign.moves.clear();
  ctx.canvas.areaRequest.set(null);
};

/** Start placing an action's area on the scene, or stop. */
const toggleAreaRequest = (canvas: CanvasState, area: AreaSpec, actor: string) => {
  canvas.areaRequest.set(canvas.areaRequest.value ? null : { area, actor, n: Date.now() });
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
  const ctx = useCampaign();
  const target = useQuery(ctx.campaign.moves.targets);
  const requestedMove = useQuery(ctx.campaign.moves.ask);
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
  const [last, setLast] = useState<Request | null>(null);
  if (live && live !== last) setLast(live);
  const shown = live ?? last;
  const ref = useRef<HTMLDialogElement>(null);
  const anchor = useRef<Element | null>(null);
  const leaving = useRef<Animation | null>(null);

  // Whether a request was on screen as of the last commit.
  const wasShown = useRef(false);
  // A new request takes the button just pressed as its anchor, unless that was in the bubble (targets → roll).
  useLayoutEffect(() => {
    if (!live) return;
    const pressed = lastPressed();
    if (pressed && !ref.current?.contains(pressed)) anchor.current = pressed;
    else if (!wasShown.current) anchor.current = null;
    leaving.current?.cancel();
    leaving.current = null;
  }, [live]);
  useLayoutEffect(() => {
    wasShown.current = shown !== null;
  });

  // Shrink back into the button once the request is done or cancelled.
  useLayoutEffect(() => {
    if (hasLive || !shown) return;
    const el = ref.current;
    if (!el || reducedMotion.matches) {
      setLast(null);
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
        if (leaving.current === a) setLast(null);
      },
      () => {},
    );
  }, [hasLive, shown]);

  const open = !!shown;
  // Follow the button as its sidebar moves; use the hotbar fallback if it leaves the viewport.
  useLayoutEffect(() => {
    if (!open) return;
    const el = ref.current;
    if (!el) return;
    let active = true;
    let revision = 0;
    let entered = false;
    const enter = () => {
      if (entered || reducedMotion.matches) return;
      entered = true;
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
    };
    const place = async () => {
      const currentRevision = ++revision;
      const source = anchor.current;
      const a = anchorRect(source);
      if (!a || !source) {
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        el.dataset.side = "none";
        el.style.left = `${Math.round(Math.min(Math.max((innerWidth - w) / 2, MARGIN), innerWidth - w - MARGIN))}px`;
        el.style.top = `${Math.round(Math.min(Math.max(innerHeight - h - 60, MARGIN), innerHeight - h - MARGIN))}px`;
        el.style.setProperty("--tail", "0px");
        enter();
        return;
      }

      const side =
        a.top > innerHeight - BOTTOM_BAND
          ? "top"
          : innerWidth - a.right - GAP - MARGIN >= el.offsetWidth ||
              a.left + a.width / 2 < innerWidth / 2
            ? "right"
            : "left";
      el.dataset.side = side === "top" ? "above" : side;
      const tail = el.querySelector<HTMLElement>(".roll-prompt-tail");
      const result = await computePosition(source, el, {
        strategy: "fixed",
        placement: side,
        middleware: [
          offset(GAP),
          flip({ padding: MARGIN }),
          shift({ padding: MARGIN }),
          ...(tail ? [arrow({ element: tail, padding: 16 })] : []),
        ],
      });
      if (!active || currentRevision !== revision) return;
      const placement = result.placement.split("-")[0];
      el.dataset.side =
        placement === "top" ? "above" : placement === "bottom" ? "below" : placement;
      el.style.left = `${Math.round(result.x)}px`;
      el.style.top = `${Math.round(result.y)}px`;
      const arrowOffset = result.middlewareData.arrow;
      const along = placement === "left" || placement === "right" ? arrowOffset?.y : arrowOffset?.x;
      if (along !== undefined) el.style.setProperty("--tail", `${along + 12}px`);
      enter();
    };

    const source = anchor.current;
    if (source) {
      const cleanup = autoUpdate(source, el, () => void place(), { animationFrame: true });
      return () => {
        active = false;
        cleanup();
      };
    }
    void place();
    const onResize = () => void place();
    window.addEventListener("resize", onResize);
    return () => {
      active = false;
      window.removeEventListener("resize", onResize);
    };
  }, [open, live]);

  // Hand a targeting request to the scene, so clicks on tokens target it.
  useEffect(
    () =>
      watch([ctx.campaign.moves.targets], () => {
        const r = ctx.campaign.moves.targets.value;
        const s = r && systemOf(campaign).actions.find((m) => m.id === r.moveId)?.target;
        ctx.canvas.targetPick.set(
          r && s ? { ...(s.max !== undefined ? { max: s.max } : {}), actor: r.characterId } : null,
        );
        if (r) ctx.tools.activeTool.set("select");
      }),
    [ctx, campaign],
  );
  useEffect(() => () => cancel(ctx), [ctx]);

  // Escape backs out, before the canvas uses it to clear the selection.
  useEffect(() => {
    if (!hasLive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      cancel(ctx);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [ctx, hasLive]);

  const req = shown;
  const move = req ? systemOf(campaign).actions.find((m) => m.id === req.moveId) : undefined;
  const c = req ? getCharacter(campaign, req.characterId) : undefined;
  if (!req || !move || !c) return null;

  return (
    <dialog
      open
      ref={ref}
      className="roll-prompt panel"
      aria-label={`${move.name} (${c.name})`}
      inert={!hasLive}
    >
      <div className="roll-prompt-head">
        <span className="eyebrow">
          {move.name} · {c.name}
        </span>
        <Button variant="icon" label="Cancel" onClick={() => cancel(ctx)}>
          <IconClose />
        </Button>
      </div>
      <RichTextView
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
    </dialog>
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
  const ctx = useCampaign();
  const move = systemOf(campaign).actions.find((m) => m.id === moveId)!;
  const spec = move.target!;
  const targets = useQuery(ctx.canvas.chosenTargets);
  const ready = targets.length >= spec.min;
  const fmt = useQuery(ctx.canvas.sceneDistance);
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
    ctx.execute(startMove, { characterId, move: move.id, targets: picked });
  };
  const area = spec.area;
  const request = useQuery(ctx.canvas.areaRequest);
  const placed = useQuery(ctx.canvas.placedArea);
  const placing = !!request;
  const placeArea = () => toggleAreaRequest(ctx.canvas, area!, characterId);
  return (
    <div className="move-form">
      <p className="roll-prompt-text">{spec.prompt}</p>
      {area && (
        <Button variant={placed ? "ghost" : "secondary"} pressed={placing} onClick={placeArea}>
          {placing
            ? "Click the map to place it"
            : placed
              ? "Place the area again"
              : `Place the ${areaName(fmt, area)}`}
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
const areaName = (fmt: (d: number) => string, a: AreaSpec) => `${fmt(a.size)} ${a.shape}`;

/** A formula without its labels, as the Roll button reads: 1d20+2[Prof] → 1d20+2. */
const bare = (formula: string) => formula.replace(/\[[^\]]*\]/g, "");

/** A move's text without the list of questions the prompt asks as checkboxes below it. */
/** The move's text without the list items its form asks as questions. */
function withoutAskedQuestions(move: ActionDef): RichText {
  const ask = needsChoice(move);
  if (ask?.kind !== "questions") return move.text;
  const asked = new Set(ask.questions);
  const prune = (node: RichText): RichText | null => {
    if (node.type === "listItem" && asked.has(plainText({ content: node.content ?? [] }).trim()))
      return null;
    if (!node.content) return node;
    const content = node.content.flatMap((child): RichText[] => {
      const kept = prune(child);
      return kept ? [kept] : [];
    });
    const emptyList =
      (node.type === "bulletList" || node.type === "orderedList") && !content.length;
    return emptyList ? null : { ...node, content };
  };
  return prune(move.text) ?? emptyRichText();
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
  const ctx = useCampaign();
  const system = systemOf(campaign);
  const move = system.actions.find((m) => m.id === moveId)!;
  const c = getCharacter(campaign, characterId)!;
  const targets = campaign.moves.ask.value?.targets;
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
  const [extra, setExtra] = useState(campaign.moves.ask.value?.choice?.extra ?? 0);
  const [variant, setVariant] = useState("");
  const yesesSet = new Set(yeses);
  const rollBonusesSet = new Set(rollBonuses);
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
    void ctx.execute(makeMove, { characterId: c.id, move, choice: choiceWith(mode), targets });
    campaign.moves.ask.set(null);
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
                checked={yesesSet.has(question)}
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
          const selected = rollBonusesSet.has(bonus.id);
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
