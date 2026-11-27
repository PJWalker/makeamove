import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { arrow, autoUpdate, computePosition, flip, offset, shift } from "@floating-ui/dom";
import { useSelector } from "@xstate/react";
import { lastPressed } from "../ui/pressed";
import { IconClose } from "../ui/icons";
import { Button } from "../ui/Button";
import { reducedMotion } from "../ui/transition";
import { growFrom, leave } from "../ui/morph";
import type { Campaign } from "../campaign/campaign";
import { inRange } from "../scene/measure";
import { needsChoice } from "../features/characters/moves";
import { getCharacter, systemOf } from "../features/characters/api";
import { RichTextView } from "../workspace/RichTextView";
import type {RichText} from "../data/richText";
import { emptyRichText, plainText  } from "../data/richText";
import { useQuery } from "../ui/useQuery";
import type { ActionDef, AreaSpec } from "../systems/types";
import type { MoveTarget } from "../features/chat/types";
import { useCampaign } from "../workspace/campaignContext";
import type { CanvasState } from "../workspace/canvasState";
import type { CampaignContext } from "../workspace/campaignContext";
import { startMove } from "../workspace/commands/characters";
import { onScreenRect } from "./onScreenRect";
import { AskStep } from "./MoveAskForm";

/*
 * What a move asks before it rolls, in a speech bubble beside the button that
 * started it (a sheet's roll, a hotbar slot, a move's glyph): first its
 * targets, picked on the map, then any stat, number, roll mode (advantage)
 * and extra bonus, with the formula as it will roll. The bubble grows out of
 * that button and shrinks back into it, like a chat popup out of the Chat
 * tab, but quicker, since the user asked for it. It follows the button as
 * sidebars slide; without one on screen it sits above the hotbar.
 */

/** Between the button and the bubble, room for the tail. */
const GAP = 14;
/** The closest the bubble comes to the window's edges. */
const MARGIN = 8;
/** A button this close to the bottom (the hotbar) gets the bubble above it. */
const BOTTOM_BAND = 120;

interface Request { kind: "ask" | "target"; moveId: string; characterId: string }

const cancel = (context: CampaignContext) => {
  context.campaign.moves.clear();
  context.canvas.areaRequest.set(null);
};

/** Start placing an action's area on the scene, or stop. */
const toggleAreaRequest = (canvas: CanvasState, area: AreaSpec, actor: string) => {
  canvas.areaRequest.set(canvas.areaRequest.value ? null : { area, actor, n: Date.now() });
};

/** Where the bubble goes: above a button near the bottom (the hotbar), else beside it, to the right where there's room. */
function preferredSide(anchor: DOMRect, width: number): "left" | "right" | "top" {
  if (anchor.top > innerHeight - BOTTOM_BAND) return "top";
  const roomRight = innerWidth - anchor.right - GAP - MARGIN >= width;
  return roomRight || anchor.left + anchor.width / 2 < innerWidth / 2 ? "right" : "left";
}

/** A placement as the bubble's `data-side` names it. */
function sideName(placement: string | undefined) {
  if (placement === "top") return "above";
  if (placement === "bottom") return "below";
  return placement;
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
        <Button variant="icon" label="Cancel" onClick={() => { cancel(ctx); }}>
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
  const context = useCampaign();
  const target = useSelector(context.campaign.moves.actor, (snapshot) => snapshot.context.targets);
  const requestedMove = useSelector(context.campaign.moves.actor, (snapshot) => snapshot.context.ask);
  const live = useMemo((): Request | null => {
    if (target) return { kind: "target", ...target };
    if (requestedMove) return { kind: "ask", ...requestedMove };
    return null;
  }, [target, requestedMove]);
  const hasLive = live !== null;
  // What's on screen: the live request, or the last one while it shrinks away.
  const [last, setLast] = useState<Request | null>(null);
  if (live && live !== last) setLast(live);
  const shown = live ?? last;
  const reference = useRef<HTMLDialogElement>(null);
  const anchor = useRef<Element | null>(null);

  // Whether a request was on screen as of the last commit.
  const wasShown = useRef(false);
  // A new request takes the button just pressed as its anchor, unless that was in the bubble (targets → roll).
  useLayoutEffect(() => {
    if (!live) return;
    const pressed = lastPressed();
    if (pressed && !reference.current?.contains(pressed)) anchor.current = pressed;
    else if (!wasShown.current) anchor.current = null;
  }, [live]);
  useLayoutEffect(() => {
    wasShown.current = shown !== null;
  });

  // Shrink back into the button once the request is done or cancelled.
  useLayoutEffect(() => {
    if (hasLive || !shown) return;
    const element = reference.current;
    if (!element || reducedMotion.matches) {
      setLast(null);
      return;
    }
    void leave(
      element,
      () => {
        if (shown) setLast(null);
      },
      null,
    );
  }, [hasLive, shown]);

  const open = !!shown;
  // Follow the button as its sidebar moves; use the hotbar fallback if it leaves the viewport.
  useLayoutEffect(() => {
    if (!open) return;
    const element = reference.current;
    if (!element) return;
    let active = true;
    let revision = 0;
    let entered = false;
    const enter = () => {
      if (entered || reducedMotion.matches) return;
      entered = true;
      const origin = onScreenRect(anchor.current);
      if (origin) growFrom(element, origin);
    };
    const place = async () => {
      const currentRevision = ++revision;
      const source = anchor.current;
      const a = onScreenRect(source);
      if (!a || !source) {
        const w = element.offsetWidth;
        const h = element.offsetHeight;
        element.dataset["side"] = "none";
        element.style.left = `${Math.round(Math.min(Math.max((innerWidth - w) / 2, MARGIN), innerWidth - w - MARGIN))}px`;
        element.style.top = `${Math.round(Math.min(Math.max(innerHeight - h - 60, MARGIN), innerHeight - h - MARGIN))}px`;
        element.style.setProperty("--tail", "0px");
        enter();
        return;
      }

      const side = preferredSide(a, element.offsetWidth);
      element.dataset["side"] = sideName(side);
      const tail = element.querySelector<HTMLElement>(".roll-prompt-tail");
      const result = await computePosition(source, element, {
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
      element.dataset["side"] = sideName(placement);
      element.style.left = `${Math.round(result.x)}px`;
      element.style.top = `${Math.round(result.y)}px`;
      const arrowOffset = result.middlewareData.arrow;
      const along = placement === "left" || placement === "right" ? arrowOffset?.y : arrowOffset?.x;
      if (along !== undefined) element.style.setProperty("--tail", `${along + 12}px`);
      enter();
    };

    const source = anchor.current;
    if (source) {
      const cleanup = autoUpdate(source, element, () => void place(), { animationFrame: true });
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
  useEffect(() => {
    const syncTargets = () => {
      const r = context.campaign.moves.actor.getSnapshot().context.targets;
      const s = r && systemOf(campaign).actions.find((m) => m.id === r.moveId)?.target;
      context.canvas.targetPick.set(
        r && s ? { ...(s.max === undefined ? {} : { max: s.max }), actor: r.characterId } : null,
      );
      if (r) context.tools.activeTool.set("select");
    };
    syncTargets();
    const stop = context.campaign.moves.actor.subscribe(syncTargets);
    return () => { stop.unsubscribe(); };
  }, [context, campaign]);
  useEffect(() => () => { cancel(context); }, [context]);

  // Escape backs out, before the canvas uses it to clear the selection.
  useEffect(() => {
    if (!hasLive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      cancel(context);
    };
    globalThis.addEventListener("keydown", onKey, true);
    return () => { globalThis.removeEventListener("keydown", onKey, true); };
  }, [context, hasLive]);

  const request = shown;
  const move = request ? systemOf(campaign).actions.find((m) => m.id === request.moveId) : undefined;
  const character = request ? getCharacter(campaign, request.characterId) : undefined;
  return { ctx: context, hasLive, ref: reference, req: request, move, character };
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
  const context = useCampaign();
  const move = systemOf(campaign).actions.find((m) => m.id === moveId)!;
  const spec = move.target!;
  const targets = useQuery(context.canvas.chosenTargets);
  const ready = targets.length >= spec.min;
  const fmt = useQuery(context.canvas.sceneDistance);
  const wanted = wantedTargets(spec.max);
  const reach = (d: number | null) =>
    spec.range && d !== null ? inRange(d, spec.range) : "normal";
  const blocked = targets.some((t) => reach(t.distance) === "out");
  const go = () => {
    if (!ready || blocked) return;
    const picked: MoveTarget[] = targets.map((t) => ({
      id: t.id,
      name: t.name,
      ...(t.characterId ? { characterId: t.characterId } : {}),
      ...(t.distance === null ? {} : { distance: fmt(t.distance) }),
      ...(reach(t.distance) === "long" ? { long: true } : {}),
    }));
    context.execute(startMove, { characterId, move: move.id, targets: picked });
  };
  const {area} = spec;
  const request = useQuery(context.canvas.areaRequest);
  const placed = useQuery(context.canvas.placedArea);
  const placing = !!request;
  const placeArea = () => { toggleAreaRequest(context.canvas, area!, characterId); };
  return (
    <div className="move-form">
      <p className="roll-prompt-text">{spec.prompt}</p>
      {area && (
        <Button variant={placed ? "ghost" : "secondary"} pressed={placing} onClick={placeArea}>
          {areaButtonLabel(placing, !!placed, areaName(fmt, area))}
        </Button>
      )}
      {targets.length > 0 ? (
        <span className="roll-prompt-targets">
          {targets.map((t) => {
            const r = reach(t.distance);
            const out = r === "out";
            return (
              <span
                key={t.id}
                className="target-chip"
                data-out={out || undefined}
                title={RANGE_TITLES[r]}
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

/** How many targets a move wants, as the prompt asks for them. */
function wantedTargets(max: number | undefined) {
  if (max === 1) return "one target";
  return max ? `up to ${max} targets` : "any number of targets";
}

function areaButtonLabel(placing: boolean, placed: boolean, name: string) {
  if (placing) return "Click the map to place it";
  return placed ? "Place the area again" : `Place the ${name}`;
}

/** A target chip's tooltip, for a target that isn't in normal range. */
const RANGE_TITLES: Record<ReturnType<typeof inRange>, string | undefined> = {
  normal: undefined,
  long: "Long range",
  out: "Out of range",
};

/** An area as the button names it: "20 ft sphere". */
const areaName = (fmt: (d: number) => string, a: AreaSpec) => `${fmt(a.size)} ${a.shape}`;

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
      (node.type === "bulletList" || node.type === "orderedList") && content.length === 0;
    return emptyList ? null : { ...node, content };
  };
  return prune(move.text) ?? emptyRichText();
}
