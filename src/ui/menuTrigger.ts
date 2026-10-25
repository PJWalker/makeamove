/*
 * Opening a right-click menu the same way everywhere. Browsers fire
 * `contextmenu` on press on macOS but on release on Windows, which would
 * break press-drag-release menus there. So a right-button press opens the
 * menu itself, and the browser's `contextmenu` event that follows (on press
 * or on release) is swallowed. `contextmenu` still opens the menu when no
 * press came first: the keyboard menu key, Shift+F10, or a touch long-press.
 */

/** A right-button press opened a menu; its `contextmenu` event is still to come. */
let pressOpened = false

export function menuTrigger(open: (x: number, y: number) => void) {
  return {
    onPointerDown(e: PointerEvent) {
      if (e.button !== 2 || e.pointerType === 'touch') {
        pressOpened = false
        return
      }
      pressOpened = true
      open(e.clientX, e.clientY)
    },
    onContextMenu(e: MouseEvent) {
      e.preventDefault()
      if (pressOpened) {
        pressOpened = false
        return
      }
      open(e.clientX, e.clientY)
    },
  }
}
