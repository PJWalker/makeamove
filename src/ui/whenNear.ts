/** How far beyond its scroller's visible area an element counts as near: about a screenful. */
const MARGIN = "800px 0px";

/** One observer per scroller (the document when there's none), shared by everything waiting in it. */
const observers = new WeakMap<Element | Document, IntersectionObserver>();
const waiting = new WeakMap<Element, () => void>();

/** The nearest ancestor that scrolls vertically, or null for the page itself. */
function scrollerOf(element: Element) {
  for (let e = element.parentElement; e; e = e.parentElement) {
    const { overflowY } = getComputedStyle(e);
    if (overflowY === "auto" || overflowY === "scroll") return e;
  }
  return null;
}

function observerFor(root: Element | null) {
  const key = root ?? document;
  let observer = observers.get(key);
  if (!observer) {
    observer = new IntersectionObserver(
      (entries, self) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          self.unobserve(entry.target);
          const then = waiting.get(entry.target);
          waiting.delete(entry.target);
          then?.();
        }
      },
      { root, rootMargin: MARGIN },
    );
    observers.set(key, observer);
  }
  return observer;
}

/** Calls `then` once, when `element` scrolls into or near view; the returned function stops waiting. */
export function whenNear(element: Element, then: () => void) {
  const observer = observerFor(scrollerOf(element));
  waiting.set(element, then);
  observer.observe(element);
  return () => {
    waiting.delete(element);
    observer.unobserve(element);
  };
}
