/*
 * Opening a right-click menu the same way everywhere. Browsers fire
 * `contextmenu` on press on macOS but on release on Windows, which would
 * break press-drag-release menus there. So a right-button press opens the
 * menu itself, and the browser's `contextmenu` event that follows (on press
 * or on release) is swallowed. `contextmenu` still opens the menu when no
 * press came first: the keyboard menu key, Shift+F10, or a touch long-press.
 *
 * The swallowing happens on the window, not the trigger: the menu opens
 * under the pointer before the browser's event arrives, so that event is
 * aimed at the menu (or the layer behind it that catches outside clicks),
 * not at the element that opened it. While a menu is open, a right-click
 * anywhere is the player's, never the browser's.
 */

/** A right-button press opened a menu; its `contextmenu` event is still to come. */
let pressOpened = false;

window.addEventListener(
  "contextmenu",
  (e) => {
    if (pressOpened || document.querySelector("[data-context-menu]")) {
      pressOpened = false;
      e.preventDefault();
    }
  },
  { capture: true },
);

type PointerInput = Pick<PointerEvent, "button" | "pointerType" | "clientX" | "clientY">;
type MouseInput = Pick<MouseEvent, "clientX" | "clientY" | "preventDefault" | "defaultPrevented">;

export function menuTrigger(open: (x: number, y: number) => void): {
  onPointerDown: (event: PointerInput) => void;
  onContextMenu: (event: MouseInput) => void;
} {
  return {
    onPointerDown(e) {
      if (e.button !== 2 || e.pointerType === "touch") {
        pressOpened = false;
        return;
      }
      pressOpened = true;
      open(e.clientX, e.clientY);
    },
    onContextMenu(e) {
      // Already swallowed on the window: a press opened the menu, or one is open.
      if (e.defaultPrevented) return;
      e.preventDefault();
      open(e.clientX, e.clientY);
    },
  };
}
