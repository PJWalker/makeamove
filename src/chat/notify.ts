import { effect, signal } from '@preact/signals'
import { stampTime } from '../lib/hlc'
import { activeCampaign } from '../store/campaign'
import { device } from '../store/device'
import { panelVisible } from '../table/panelLayout'
import type { LinkKind } from '../notes/api'
import { linkLabel } from '../notes/targets'
import { plainText } from './markdown'
import { visibilityOf, type ChatMessage } from './types'

/*
 * Chat that arrives while the Chat panel isn't showing pops up over the
 * table (table/ChatPopups.tsx), whether or not the window has focus. When
 * the page is known not to be visible (a background tab, a minimised
 * window), other people's messages also raise a system notification; the
 * popup waits for the page to show again. A visible window that merely lacks
 * focus gets no notification: the popup is on screen.
 *
 * These are local notifications, raised by this page when a message
 * arrives. There is no server to push from, so they work while the app is
 * open, not after it's closed.
 */

/** The title and body to show for a message, or null if it isn't worth a notification. */
export function describe(m: ChatMessage, nameOf?: (kind: LinkKind, id: string) => string | null): { title: string; body: string } | null {
  switch (m.kind) {
    case 'text': {
      const text = plainText(m.text, nameOf)
      return { title: m.to ? `${m.name} (whisper)` : m.name, body: m.emote ? `${m.name} ${text}` : text }
    }
    case 'roll':
      return { title: m.name, body: `${m.comment ? `${m.comment}: ` : ''}${m.roll.formula} = ${m.roll.total}` }
    case 'move':
      return { title: m.characterName, body: `${m.moveName}${m.roll ? ` (${m.roll.total})` : ''}` }
    case 'timer':
      return { title: m.name, body: `Timer: ${m.label || 'started'}` }
    case 'counter':
      return { title: m.name, body: `Counter: ${m.label || 'started'}` }
    case 'system':
      return null
  }
}

/**
 * How a new message reaches someone not reading the chat: a popup whenever
 * the Chat panel isn't showing, and a system notification too when the page
 * is hidden and the message is someone else's.
 */
export function delivery(o: { chatShowing: boolean; pageHidden: boolean; mine: boolean; canNotify: boolean }): { popup: boolean; notify: boolean } {
  return { popup: !o.chatShowing, notify: o.pageHidden && !o.mine && o.canNotify }
}

/** Only a page the browser reports hidden counts as out of sight; an unfocused window may still be on screen. */
const pageHidden = () => document.visibilityState === 'hidden'

/** The most popups shown at once; older ones give way. */
const MAX_POPUPS = 3

/** Messages (by id) shown over the table while the Chat panel is out of view. */
export const chatPopups = signal<string[]>([])

export function dismissPopup(id: string) {
  chatPopups.value = chatPopups.value.filter((p) => p !== id)
}

function popUp(id: string) {
  chatPopups.value = [...chatPopups.value, id].slice(-MAX_POPUPS)
}

async function show(title: string, body: string, tag: string) {
  const options: NotificationOptions = { body, tag, icon: '/icon-192.png' }
  const reg = await navigator.serviceWorker?.getRegistration().catch(() => undefined)
  if (reg) {
    await reg.showNotification(title, options)
    return
  }
  const n = new Notification(title, options)
  n.onclick = () => {
    window.focus()
    n.close()
  }
}

/** Asks once, on the first interaction (browsers only allow it then). */
function askPermission() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'default') return
  const ask = () => void Notification.requestPermission()
  window.addEventListener('pointerdown', ask, { once: true })
}

/** Start watching the open campaign's chat. Returns a stop function. */
export function startChatNotifications() {
  const canNotify = typeof Notification !== 'undefined'
  if (canNotify) askPermission()
  const started = Date.now()
  const told = new Set<string>()
  const stop = effect(() => {
    const c = activeCampaign.value
    const messages = c?.chat.messages.value
    if (!c || !messages) return
    const me = device.value.id
    const isGm = c.isGm()
    for (const m of messages) {
      if (told.has(m.id)) continue
      // History loaded at start-up, or synced from before this page opened, isn't news.
      if (stampTime(m.hlc) < started) continue
      told.add(m.id)
      if (m.kind === 'system' || visibilityOf(m, me, isGm) !== 'full') continue
      // My own messages pop up too (a move from the hotbar should show its result), but never notify.
      // An open Chat panel in a hidden page isn't being read either, so that notifies.
      const how = delivery({
        chatShowing: panelVisible('chat'),
        pageHidden: pageHidden(),
        mine: m.author === me,
        canNotify: canNotify && Notification.permission === 'granted',
      })
      if (how.popup) popUp(m.id)
      if (how.notify) {
        const text = describe(m, (kind, id) => linkLabel(c, kind, id))
        if (text) void show(text.title, text.body, m.id).catch(() => {})
      }
    }
  })
  // Opening the chat, or leaving the campaign, clears what's popped up.
  const clear = effect(() => {
    void activeCampaign.value
    if (panelVisible('chat') || !activeCampaign.value) chatPopups.value = []
  })
  return () => {
    stop()
    clear()
    chatPopups.value = []
  }
}
