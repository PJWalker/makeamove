import { useSignal } from '@preact/signals'
import type { JSX } from 'preact'
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks'
import { chatPopups, dismissPopup } from '../chat/notify'
import type { ChatMessage } from '../chat/types'
import { markRead } from '../chat/unread'
import type { Campaign } from '../store/campaign'
import { collapsedInto, reducedMotion } from '../ui/bubble'
import { Button } from '../ui/Button'
import { IconClose } from '../ui/icons'
import { LoneMessage } from './ChatPanel'
import { showPanel } from './panelLayout'

/*
 * Chat that arrives while the Chat panel is closed or behind another tab pops
 * up beside the Chat tab, as if the tab were speaking (chat/notify.ts decides
 * when): the whole message, as the log shows it. Several in a row stack, the
 * newest in front and older ones receding behind it. Each grows out of the
 * tab and shrinks back into it. When the tab isn't on screen (the panel is
 * floating or closed, or autohide has slid the sidebar away), the stack sits
 * in the table's bottom-right corner instead.
 *
 * A popup leaves on its own after a few seconds; the stack waits while the
 * pointer is on it, and while the page is hidden, so popups that arrive in a
 * background tab are still there to read on coming back. Clicking the front one, anywhere but its buttons and
 * links, opens the chat; its × sends the whole stack away. Any of that counts
 * as reading the chat, which clears the Chat tab's unread badge.
 */

/** How long a popup stays, once the pointer isn't on the stack. */
const STAY_MS = 6000
const ENTER_MS = 280
const LEAVE_MS = 220
const EASE = 'cubic-bezier(0.2, 0.7, 0.2, 1)'
/** Between the tab and the bubble, room for the bubble's tail. */
const GAP = 16
/** The closest the bubble comes to the window's top and bottom edges. */
const MARGIN = 8

const chatTab = () => document.querySelector('.rail-tab[data-panel="chat"]')

/** The Chat tab's box, if it's on screen. */
function tabRect() {
  const r = chatTab()?.getBoundingClientRect()
  return r && r.width > 0 && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight ? r : null
}

/** A popup squeezed into the Chat tab, or a little below itself when the tab isn't showing. */
const collapsed = (box: DOMRect): Keyframe => collapsedInto(box, tabRect())

export function ChatPopups({ campaign }: { campaign: Campaign }) {
  const messages = campaign.chat.messages.value
  // Looked up live, so a deleted message takes its popup with it.
  const shown = chatPopups.value.map((id) => messages.find((m) => m.id === id)).filter((m) => !!m)
  const held = useSignal(false)
  const hidden = useSignal(document.visibilityState === 'hidden')
  useEffect(() => {
    const onVisibility = () => (hidden.value = document.visibilityState === 'hidden')
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])
  const leavingAll = useSignal(false)
  const ref = useRef<HTMLDivElement>(null)
  const stack = useRef<HTMLDivElement>(null)
  const any = shown.length > 0

  // Beside the Chat tab, or in the corner without it.
  const placed = useRef('')
  const place = () => {
    const el = ref.current
    const box = stack.current
    if (!el || !box) return
    const tab = tabRect()
    const h = box.offsetHeight
    let next: Record<string, string>
    if (!tab) next = { anchor: 'corner', left: '', right: '', top: '', tail: '' }
    else {
      const right = tab.left + tab.width / 2 > innerWidth / 2
      const mid = tab.top + tab.height / 2
      const top = Math.round(Math.min(Math.max(mid - h / 2, MARGIN), innerHeight - h - MARGIN))
      next = {
        anchor: right ? 'right' : 'left',
        left: right ? '' : `${Math.round(tab.right + GAP)}px`,
        right: right ? `${Math.round(innerWidth - tab.left + GAP)}px` : '',
        top: `${top}px`,
        tail: `${Math.round(mid - top)}px`,
      }
    }
    const key = Object.values(next).join()
    if (key === placed.current) return
    placed.current = key
    el.dataset.anchor = next.anchor
    el.style.left = next.left!
    el.style.right = next.right!
    el.style.top = next.top!
    el.style.setProperty('--tail-y', next.tail!)
  }

  // Follow the tab while anything is showing: it slides with its sidebar and with autohide.
  useLayoutEffect(() => {
    if (!any) {
      placed.current = ''
      return
    }
    let frame = 0
    const follow = () => {
      place()
      frame = requestAnimationFrame(follow)
    }
    follow()
    return () => cancelAnimationFrame(frame)
  }, [any])

  useEffect(() => {
    if (!any) {
      held.value = false
      leavingAll.value = false
    }
  }, [any])

  if (!any) return null
  return (
    <div
      ref={ref}
      class="chat-popups"
      role="status"
      aria-live="polite"
      onPointerEnter={() => (held.value = true)}
      onPointerLeave={() => (held.value = false)}
      onPointerDown={markRead}
    >
      <div ref={stack} class="chat-popup-stack">
        {shown.map((m, i) => (
          <Popup
            key={m.id}
            campaign={campaign}
            m={m}
            depth={shown.length - 1 - i}
            held={held.value || hidden.value}
            leaving={leavingAll.value}
            stack={stack}
            place={place}
            onDismissAll={() => (leavingAll.value = true)}
          />
        ))}
      </div>
      <span class="chat-popup-tail" aria-hidden="true" />
    </div>
  )
}

function Popup({
  campaign,
  m,
  depth,
  held,
  leaving,
  stack,
  place,
  onDismissAll,
}: {
  campaign: Campaign
  m: ChatMessage
  /** 0 for the one in front, counting back. */
  depth: number
  held: boolean
  /** The whole stack is going away. */
  leaving: boolean
  /** Every popup shares the stack's box; the ones behind are only shifted by their depth. */
  stack: { current: HTMLDivElement | null }
  /** Puts the stack beside the tab; it must be there before a popup measures where to grow from. */
  place: () => void
  onDismissAll: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const gone = useRef(false)

  const leave = () => {
    const el = ref.current
    const box = stack.current?.getBoundingClientRect()
    if (gone.current) return
    gone.current = true
    if (!el || !box || reducedMotion.matches) return dismissPopup(m.id)
    // Start from wherever it is now: at rest, part-way in, or set back in the stack.
    const from = getComputedStyle(el).transform
    el.getAnimations().forEach((a) => a.cancel())
    el.animate([{ transform: from, opacity: 1 }, { opacity: 1, offset: 0.6 }, collapsed(box)], { duration: LEAVE_MS, easing: 'ease-in', fill: 'forwards' }).finished.then(
      () => dismissPopup(m.id),
      () => {},
    )
  }

  useLayoutEffect(() => {
    // This runs before the stack's own layout effect places it, so place it now.
    place()
    const el = ref.current
    const box = stack.current?.getBoundingClientRect()
    if (el && box && !reducedMotion.matches) {
      el.animate([collapsed(box), { opacity: 1, offset: 0.4 }, { transform: 'none', opacity: 1 }], { duration: ENTER_MS, easing: EASE })
    }
  }, [])

  // Each waits its own time, all of them paused while the pointer is on the stack.
  useEffect(() => {
    if (held || leaving) return
    const timer = setTimeout(leave, STAY_MS)
    return () => clearTimeout(timer)
  }, [held, leaving])

  useEffect(() => {
    if (leaving) leave()
  }, [leaving])

  const open = (e: JSX.TargetedMouseEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest('button, a')) return
    showPanel('chat')
  }

  const front = depth === 0
  return (
    <div
      ref={ref}
      class="chat-popup panel bevel"
      data-depth={depth}
      style={{ '--depth': depth }}
      inert={!front}
      title={front ? 'Open the chat' : undefined}
      onClick={open}
    >
      <LoneMessage campaign={campaign} m={m} />
      <Button variant="icon" size="sm" class="chat-popup-close" label="Dismiss" onClick={onDismissAll}>
        <IconClose />
      </Button>
    </div>
  )
}
