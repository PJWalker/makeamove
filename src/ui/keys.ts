/** Keyboard shortcuts stop while the user is in a text field. */
export function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
}

/** The platform's shortcut modifier, as shown in menus. */
export const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+'
