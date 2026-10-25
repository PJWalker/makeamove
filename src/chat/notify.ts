import { effect } from '@preact/signals'
import { stampTime } from '../lib/hlc'
import { activeCampaign } from '../store/campaign'
import { device } from '../store/device'
import { panelVisible } from '../table/panelLayout'
import { visibilityOf, type ChatMessage } from './types'

/*
 * Notifications for chat that arrives while it isn't in view: the tab is in
 * the background, the window is unfocused, or the Chat panel is closed. These
 * are local notifications, raised by this page when a message arrives. There
 * is no server to push from, so they work while the app is open, not after
 * it's closed.
 */

/** The title and body to show for a message, or null if it isn't worth a notification. */
export function describe(m: ChatMessage): { title: string; body: string } | null {
  switch (m.kind) {
    case 'text':
      return { title: m.to ? `${m.name} (whisper)` : m.name, body: m.emote ? `${m.name} ${m.text}` : m.text }
    case 'roll':
      return { title: m.name, body: `${m.comment ? `${m.comment}: ` : ''}${m.roll.formula} = ${m.roll.total}` }
    case 'move':
      return { title: m.characterName, body: `${m.moveName}${m.roll ? ` (${m.roll.total})` : ''}` }
    case 'system':
      return null
  }
}

const inView = () => !document.hidden && document.hasFocus() && panelVisible('chat')

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
  if (typeof Notification === 'undefined') return () => {}
  askPermission()
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
      if (m.author === me || visibilityOf(m, me, isGm) !== 'full' || Notification.permission !== 'granted' || inView()) continue
      const text = describe(m)
      if (text) void show(text.title, text.body, m.id).catch(() => {})
    }
  })
  return stop
}
