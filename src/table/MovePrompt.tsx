import { emptyRichText, plainText, type RichText } from "../data/richText";
import { AskStep } from "./MoveAskForm";
import { RichTextView } from "../workspace/RichTextView";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { arrow, autoUpdate, computePosition, flip, offset, shift } from "@floating-ui/dom";
import { watch } from "../lib/store";
import { getCharacter, systemOf } from "../features/characters/api";
import { needsChoice } from "../features/characters/moves";
import { inRange } from "../scene/measure";
import type { Campaign } from "../campaign/campaign";
import { collapsedInto, reducedMotion } from "../ui/bubble";
import { Button } from "../ui/Button";
import { IconClose } from "../ui/icons";
import { lastPressed } from "../ui/pressed";
import { useQuery } from "../ui/useQuery";
import type { ActionDef, AreaSpec } from "../systems/types";
import type { MoveTarget } from "../features/chat/types";
import { useCampaign } from "../workspace/campaignContext";
import type { CanvasState } from "../workspace/canvasState";
import type { CampaignContext } from "../workspace/campaignContext";
import { startMove } from "../workspace/commands/characters";

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
  const { ctx, hasLive, ref, req, move, character } = useMovePrompt(campaign);
  if (!req || !move || !character) return null;
  return (
    <dialog
      open
      ref={ref}
      className="roll-prompt panel"
      aria-label={`${move.name} (${character.name})`}
      inert={!hasLive}
    >
      <div className="roll-prompt-head">
        <span className="eyebrow">
          {move.name} · {character.name}
        </span>
        <Button variant="icon" label="Cancel" onClick={() => cancel(ctx)}>
          <IconClose />
        </Button>
      </div>
      <RichTextView
        campaign={campaign}
        text={withoutAskedQuestions(move)}
        characterId={character.id}
        className="roll-prompt-desc"
      />
      {req.kind === "target" ? (
        <TargetStep campaign={campaign} characterId={character.id} moveId={move.id} />
      ) : (
        <AskStep
          key={`${character.id}:${move.id}`}
          campaign={campaign}
          characterId={character.id}
          moveId={move.id}
        />
      )}
      <span className="roll-prompt-tail" aria-hidden="true" />
    </dialog>
  );
}

function useMovePrompt(campaign: Campaign) {
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
        el.dataset["side"] = "none";
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
      el.dataset["side"] = side === "top" ? "above" : side;
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
      el.dataset["side"] =
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
  const character = req ? getCharacter(campaign, req.characterId) : undefined;
  return { ctx, hasLive, ref, req, move, character };
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
