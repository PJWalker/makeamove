import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { tether } from "./anchor";
import { inTransition } from "./transition";
import { setTooltipHider } from "./tooltipController";

const DELAY = 150;

type Dir = "down" | "up" | "left" | "right";

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
  /** What to show, the element it's for, and the side it would rather open on. */
  const [tip, setTip] = useState<{
    text: string;
    long?: boolean;
    el: Element;
    dir: Dir;
    instant?: boolean;
  } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer = 0;
    let current: Element | null = null;
    // Turned into something else; not shown again until the pointer leaves it.
    let suppressed: Element | null = null;
    let lastShown = 0;
    let showing = false;

    const hide = () => {
      clearTimeout(timer);
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
      const opens = (e.target as Element | null)?.closest?.("[data-tip-opens]");
      if (opens && opens === current) return;
      dismiss();
    };
    setTooltipHider(() => {
      suppressed = current;
      dismiss();
      if (ref.current?.matches(":popover-open")) ref.current.hidePopover();
    });

    function textOf(el: Element) {
      const title = el.getAttribute("title");
      if (title) {
        el.setAttribute("data-tip", title);
        el.removeAttribute("title");
      }
      return el.getAttribute("data-tip");
    }

    function show(el: Element, instant = false) {
      const text = el.getAttribute("data-tip");
      if (!text || !el.isConnected) return;
      // A tip that only repeats the label in view adds nothing; it shows once the label is hidden.
      if (el instanceof HTMLElement && el.innerText.trim() === text) return;
      const long = el.hasAttribute("data-tip-long");
      const r = el.getBoundingClientRect();
      // Centred on the item and pointing toward the middle of the screen: sideways for
      // sidebar tabs and anything marked data-tip-side, down from the top edge, up
      // from the bottom.
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      // data-tip-side="left" or "right" prefers a side; it still flips if it wouldn't fit.
      const side = el.getAttribute("data-tip-side");
      const dir: Dir =
        el.closest(".sidebar-rail") || side !== null
          ? side === "left" || side === "right"
            ? side
            : cx < innerWidth / 2
              ? "right"
              : "left"
          : cy < innerHeight / 2
            ? "down"
            : "up";
      showing = true;
      setTip({ text, long, el, dir, instant });
    }

    function consider(target: EventTarget | null, delay: number) {
      const el = (target as Element | null)?.closest?.("[title], [data-tip]") ?? null;
      if (el === current || (el && el === suppressed)) return;
      hide();
      if (!el || !textOf(el)) return;
      current = el;
      const browsing = performance.now() - lastShown < 200;
      if (browsing) show(el, true);
      else timer = window.setTimeout(() => show(el), delay);
    }

    const onOver = (e: PointerEvent) =>
      e.pointerType !== "touch" && !inTransition() && consider(e.target, DELAY);
    const onFocus = (e: FocusEvent) =>
      (e.target as Element).matches?.(":focus-visible") && consider(e.target, DELAY);
    // Focus leaving the element it belongs to; focus moving elsewhere (a
    // click that focuses a button) leaves a pointer's tooltip alone.
    const onBlur = (e: FocusEvent) => {
      if (current && current.contains(e.target as Node)) hide();
    };
    const onOut = (e: Event) => {
      if (inTransition()) return;
      const to = (e as PointerEvent).relatedTarget as Element | null;
      if (suppressed && !(to && suppressed.contains(to))) suppressed = null;
      if (!current || (to && current.contains(to))) return;
      hide();
    };

    document.addEventListener("pointerover", onOver);
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
  }, []);

  const t = tip;
  // CSS places it, flipping it to the other side if it won't fit; then point
  // the arrow at the middle of the element from whichever side it went to.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !t) return;
    const untether = tether(el, t.el);
    el.dataset.prefer = t.dir;
    el.showPopover();
    const r = t.el.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    const across = t.dir === "left" || t.dir === "right";
    el.dataset.dir = across
      ? box.left >= r.right
        ? "right"
        : "left"
      : box.top >= r.bottom
        ? "down"
        : "up";
    const arrow = across ? r.top + r.height / 2 - box.top : r.left + r.width / 2 - box.left;
    el.style.setProperty("--arrow", `${arrow}px`);
    return () => {
      if (el.matches(":popover-open")) el.hidePopover();
      untether();
    };
  }, [t]);

  return (
    <div
      ref={ref}
      className="tooltip"
      data-instant={t?.instant || undefined}
      data-long={t?.long || undefined}
      popover="manual"
      role="tooltip"
    >
      {t?.text}
    </div>
  );
}
