import { useEffect, useLayoutEffect, useRef, useState  } from "react";
import type {RefObject} from "react";
import { tether } from "./anchor";
import { inTransition } from "./transition";
import { setTooltipHider } from "./tooltipController";

const DELAY = 150;

type Dir = "down" | "left" | "right" | "up";
type Tip = { text: string; long?: boolean; el: HTMLElement; dir: Dir; instant?: boolean } | null;

/**
 * One tooltip for the whole app. It watches the pointer and keyboard focus
 * and, after a short delay, shows the `title` of whatever is under them. The
 * native tooltip would double up, so a title is moved into `data-tip` while
 * the element has one. It lives in the top layer, so it sits above dialogs,
 * and is anchored to its element (see Tooltip.css for where it goes).
 * A tip that matches the element's visible text is skipped, so a button
 * whose label can be hidden (Button's icon) has its tooltip only then.
 * An element marked `data-tip-opens` keeps its tooltip through a press, for
 * a click that turns the tooltip into a window (hideTooltip ends it).
 */
export function Tooltip() {
  const { tip, ref } = useTooltip();
  return (
    <div
      ref={ref}
      className="tooltip"
      data-instant={tip?.instant || undefined}
      data-long={tip?.long || undefined}
      popover="manual"
      role="tooltip"
    >
      {tip?.text}
    </div>
  );
}

/**
 * Where a tip prefers to go: toward the middle of the screen, sideways for
 * sidebar tabs and anything marked data-tip-side, else down from the top half
 * and up from the bottom. data-tip-side="left" or "right" picks a side; it
 * still flips if it wouldn't fit.
 */
function preferredDir(element: HTMLElement): Dir {
  const r = element.getBoundingClientRect();
  const side = element.getAttribute("data-tip-side");
  if (side === "left" || side === "right") return side;
  if (element.closest(".sidebar-rail") || side !== null)
    return r.left + r.width / 2 < innerWidth / 2 ? "right" : "left";
  return r.top + r.height / 2 < innerHeight / 2 ? "down" : "up";
}

/** The side of its element a placed tip ended up on, from the tip's box and the element's. */
function placedDir(box: DOMRect, r: DOMRect, across: boolean): Dir {
  if (across) return box.left >= r.right ? "right" : "left";
  return box.top >= r.bottom ? "down" : "up";
}

function useTooltip() {
  const [tip, setTip] = useState<Tip>(null);
  const reference = useRef<HTMLDivElement>(null);
  useTooltipTracking(setTip, reference);
  useTooltipPosition(reference, tip);
  return { tip, ref: reference };
}

function useTooltipTracking(setTip: (tip: Tip) => void, reference: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
    let current: Element | null = null;
    // Turned into something else; not shown again until the pointer leaves it.
    let suppressed: Element | null = null;
    let lastShown = 0;
    let showing = false;

    const hide = () => {
      if (timer !== undefined) clearTimeout(timer);
      current = null;
      if (showing) lastShown = performance.now();
      showing = false;
      setTip(null);
    };
    // A press, key or scroll ends the "already browsing" state too.
    const dismiss = () => {
      hide();
      lastShown = 0;
    };
    const onPress = (e: PointerEvent) => {
      const opens = (e.target as Element | null)?.closest("[data-tip-opens]");
      if (opens && opens === current) return;
      dismiss();
    };
    setTooltipHider(() => {
      suppressed = current;
      dismiss();
      if (reference.current?.matches(":popover-open")) reference.current.hidePopover();
    });

    function textOf(element: HTMLElement) {
      const title = element.getAttribute("title");
      if (title) {
        element.setAttribute("data-tip", title);
        element.removeAttribute("title");
      }
      return element.getAttribute("data-tip") ?? undefined;
    }

    function show(element: HTMLElement, instant = false) {
      const text = element.getAttribute("data-tip");
      if (!text || !element.isConnected) return;
      // A tip that only repeats the label in view adds nothing; it shows once the label is hidden.
      if (element instanceof HTMLElement && element.innerText.trim() === text) return;
      const long = element.hasAttribute("data-tip-long");
      showing = true;
      setTip({ text, long, el: element, dir: preferredDir(element), instant });
    }

    function consider(target: EventTarget | null, delay: number) {
      const element = target instanceof HTMLElement
        ? target.closest<HTMLElement>("[title], [data-tip]")
        : null;
      if (element === current || (element && element === suppressed)) return;
      hide();
      if (!element || !textOf(element)) return;
      current = element;
      const browsing = performance.now() - lastShown < 200;
      if (browsing) show(element, true);
      else timer = globalThis.setTimeout(() => { show(element); }, delay);
    }

    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== "touch" && !inTransition()) consider(e.target, DELAY);
    };
    const onFocus = (e: FocusEvent) => {
      if ((e.target as Element).matches(":focus-visible")) consider(e.target, DELAY);
    };
    // Focus leaving the element it belongs to; moving between descendants
    // should keep the current tooltip until focus is outside it.
    const onBlur = (e: FocusEvent) => {
      const next = e.relatedTarget as Node | null;
      if (current && (!next || !current.contains(next))) hide();
    };
    const onOut = (e: Event) => {
      if (inTransition()) return;
      const to = (e as PointerEvent).relatedTarget as Element | null;
      if (suppressed && !(to && suppressed.contains(to))) suppressed = null;
      if (!current || (to && current.contains(to))) return;
      hide();
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "touch" && !inTransition()) consider(e.target, DELAY);
    };

    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerout", onOut);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);
    // A press, a key or a scroll dismisses it.
    document.addEventListener("pointerdown", onPress, true);
    document.addEventListener("keydown", dismiss, true);
    document.addEventListener("scroll", dismiss, true);
    return () => {
      hide();
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerout", onOut);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onBlur);
      setTooltipHider(null);
      document.removeEventListener("pointerdown", onPress, true);
      document.removeEventListener("keydown", dismiss, true);
      document.removeEventListener("scroll", dismiss, true);
    };
    // Registered once: re-running on every tip change would hide each tip
    // as soon as it showed.
  }, [reference, setTip]);
}

function useTooltipPosition(reference: RefObject<HTMLDivElement | null>, tip: Tip) {
  // CSS places it, flipping it to the other side if it won't fit; then point
  // the arrow at the middle of the element from whichever side it went to.
  useLayoutEffect(() => {
    const element = reference.current;
    if (!element || !tip?.el.isConnected) return;
    const untether = tether(element, tip.el);
    // The popover is intentionally styled here after it has been positioned.
    // eslint-disable-next-line react-hooks/immutability
    element.dataset["prefer"] = tip.dir;
    if (!element.matches(":popover-open") && element.isConnected) element.showPopover();
    const r = tip.el.getBoundingClientRect();
    const box = element.getBoundingClientRect();
    const across = tip.dir === "left" || tip.dir === "right";
    element.dataset["dir"] = placedDir(box, r, across);
    const arrow = across ? r.top + r.height / 2 - box.top : r.left + r.width / 2 - box.left;
    element.style.setProperty("--arrow", `${arrow}px`);
    return () => {
      if (element.matches(":popover-open")) element.hidePopover();
      untether();
    };
  }, [reference, tip]);
}
