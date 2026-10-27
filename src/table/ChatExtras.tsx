import { signal, useSignal } from '@preact/signals'
import { useEffect } from 'preact/hooks'
import { getState, setState, stateOf } from '../chat/messageState'
import { canWork, visibilityOf, type ChatMessage, type CounterMessage, type TimerMessage } from '../chat/types'
import type { Campaign } from '../store/campaign'
import { device } from '../store/device'
import { useY } from '../store/useY'
import { Button } from '../ui/Button'
import { IconClose, IconRemove, IconAdd } from '../ui/icons'

/*
 * What chat messages gained in M10, all kept in the campaign's message state
 * (chat/messageState.ts) since messages themselves never change: edits to
 * text, pins (shown in a strip above the log), and the live parts of timers
 * and counters.
 */

/** The message being edited in place, on this device. */
export const editingMessage = signal<string | null>(null)

/** A message's state, re-read when it changes. */
export function useMessageState(campaign: Campaign, id: string): Record<string, any> {
  return JSON.parse(useY(campaign.messageState, () => JSON.stringify(stateOf(campaign.messageState, id))))
}

/** Text as last edited, or as sent. */
export const editedText = (state: Record<string, any>, text: string): string => state.text ?? text

export function saveEdit(campaign: Campaign, id: string, text: string) {
  campaign.doc.transact(() => {
    setState(campaign.messageState, id, 'text', text)
    setState(campaign.messageState, id, 'editedAt', Date.now())
  })
}

export const isPinned = (campaign: Campaign, id: string) => !!getState<boolean>(campaign.messageState, id, 'pinned')
export const setPinned = (campaign: Campaign, id: string, on: boolean) => setState(campaign.messageState, id, 'pinned', on || undefined)

/** The box a message is edited in: Enter saves, Escape leaves it as it was. */
export function EditBox({ campaign, id, text }: { campaign: Campaign; id: string; text: string }) {
  const value = useSignal(text)
  const done = (save: boolean) => {
    if (save && value.value.trim() && value.value !== text) saveEdit(campaign, id, value.value.trim())
    editingMessage.value = null
  }
  return (
    <textarea
      class="input bevel chat-edit"
      aria-label="Edit message"
      rows={Math.min(6, value.value.split('\n').length + 1)}
      value={value.value}
      ref={(el) => void (el && requestAnimationFrame(() => el.focus()))}
      onInput={(e) => (value.value = e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          done(true)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          done(false)
        }
      }}
      onBlur={() => done(true)}
    />
  )
}

/** The clock now, ticking every half second while something needs it. */
function useNow(running: boolean): number {
  const now = useSignal(Date.now())
  useEffect(() => {
    if (!running) return
    const t = window.setInterval(() => (now.value = Date.now()), 500)
    return () => clearInterval(t)
  }, [running])
  return now.value
}

const clock = (seconds: number) => {
  const s = Math.max(0, Math.ceil(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`
}

/** A countdown in real time: its label, the time left as a clock and a bar; restart or stop for whoever may. */
export function TimerCard({ campaign, m, compact }: { campaign: Campaign; m: TimerMessage; compact?: boolean }) {
  const state = useMessageState(campaign, m.id)
  const endsAt: number = state.endsAt ?? m.endsAt
  const stopped: number | undefined = state.stoppedAt
  const now = useNow(!stopped)
  const left = ((stopped ?? now) - endsAt) * -1 / 1000
  const done = left <= 0
  const gm = useY(campaign.members, () => campaign.isGm())
  const can = canWork(m, device.value.id, gm)
  return (
    <div class="roll-card chat-timer" data-done={done || undefined} data-compact={compact || undefined}>
      <div class="roll-head">
        <span class="roll-formula">{m.label || 'Timer'}</span>
        <span class="chat-timer-clock" aria-live={done ? 'polite' : 'off'}>
          {done ? 'Time’s up' : stopped ? `${clock(left)} stopped` : clock(left)}
        </span>
      </div>
      <div class="chat-bar" aria-hidden="true">
        <span style={{ width: `${Math.max(0, Math.min(1, left / m.seconds)) * 100}%` }} />
      </div>
      {can && !compact && (
        <div class="move-suggest">
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              campaign.doc.transact(() => {
                setState(campaign.messageState, m.id, 'endsAt', Date.now() + m.seconds * 1000)
                setState(campaign.messageState, m.id, 'stoppedAt', undefined)
              })
            }
          >
            Restart
          </Button>
          {!done &&
            (stopped ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  campaign.doc.transact(() => {
                    // Carry on from where it was stopped.
                    setState(campaign.messageState, m.id, 'endsAt', Date.now() + (endsAt - stopped))
                    setState(campaign.messageState, m.id, 'stoppedAt', undefined)
                  })
                }
              >
                Resume
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setState(campaign.messageState, m.id, 'stoppedAt', Date.now())}>
                Stop
              </Button>
            ))}
        </div>
      )}
    </div>
  )
}

/** A counter moved by hand: its value (out of its maximum), as pips when there are few. */
export function CounterCard({ campaign, m, compact }: { campaign: Campaign; m: CounterMessage; compact?: boolean }) {
  const state = useMessageState(campaign, m.id)
  const value: number = state.value ?? m.start
  const gm = useY(campaign.members, () => campaign.isGm())
  const can = canWork(m, device.value.id, gm)
  const set = (n: number) => setState(campaign.messageState, m.id, 'value', m.max !== undefined ? Math.min(m.max, Math.max(0, n)) : n)
  const full = m.max !== undefined && value >= m.max
  return (
    <div class="roll-card chat-counter" data-done={full || undefined} data-compact={compact || undefined}>
      <div class="roll-head">
        <span class="roll-formula">{m.label || 'Counter'}</span>
        <span class="chat-counter-value">
          {can && (
            <Button variant="icon" size="sm" label="Down one" disabled={m.max !== undefined && value <= 0} onClick={() => set(value - 1)}>
              <IconRemove />
            </Button>
          )}
          <span>
            {value}
            {m.max !== undefined && <span class="muted">/{m.max}</span>}
          </span>
          {can && (
            <Button variant="icon" size="sm" label="Up one" disabled={full} onClick={() => set(value + 1)}>
              <IconAdd />
            </Button>
          )}
        </span>
      </div>
      {m.max !== undefined &&
        (m.max <= 12 ? (
          <div class="chat-pips" aria-hidden="true">
            {Array.from({ length: m.max }, (_, i) => (
              <span key={i} data-on={i < value || undefined} />
            ))}
          </div>
        ) : (
          <div class="chat-bar" aria-hidden="true">
            <span style={{ width: `${(Math.max(0, value) / m.max) * 100}%` }} />
          </div>
        ))}
    </div>
  )
}

/** Pinned messages, above the log: timers and counters as they are, text in a line, each unpinnable by the GM. */
export function PinnedStrip({ campaign, render }: { campaign: Campaign; render: (m: ChatMessage) => preact.ComponentChildren }) {
  const pinnedIds = useY(campaign.messageState, () =>
    [...campaign.messageState.entries()]
      .filter(([k, v]) => k.endsWith('/pinned') && v)
      .map(([k]) => k.slice(0, -'/pinned'.length))
      .join(' '),
  )
  const messages = campaign.chat.messages.value
  const gm = useY(campaign.members, () => campaign.isGm())
  const me = device.value.id
  const ids = new Set(pinnedIds.split(' ').filter(Boolean))
  const pinned = messages.filter((m) => ids.has(m.id) && visibilityOf(m, me, gm) === 'full')
  if (!pinned.length) return null
  return (
    <section class="chat-pinned" aria-label="Pinned">
      {pinned.map((m) => (
        <div key={m.id} class="chat-pin">
          <div class="chat-pin-body">{render(m)}</div>
          {gm && (
            <Button variant="icon" size="sm" label="Unpin" onClick={() => setPinned(campaign, m.id, false)}>
              <IconClose />
            </Button>
          )}
        </div>
      ))}
    </section>
  )
}
