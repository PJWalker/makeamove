let hideNow: (() => void) | null = null;

export function setTooltipHider(hide: (() => void) | null) {
  hideNow = hide;
}

/** Take the tooltip away at once, without waiting for a render. */
export function hideTooltip() {
  hideNow?.();
}
