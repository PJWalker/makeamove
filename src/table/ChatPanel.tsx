import { signal, useComputed, useSignal, useSignalEffect } from '@preact/signals'
import { Fragment } from 'preact'
import { useCallback, useEffect, useLayoutEffect, useRef } from 'preact/hooks'
import { COMMANDS, parseCommand, suggest } from '../chat/commands'
import { tokenize } from '../chat/markdown'
import { postRoll, runCommand } from '../chat/send'
import type { ChatMessage, RollMessage, RollVisibility, TextMessage } from '../chat/types'
import { canDelete, visibilityOf } from '../chat/types'
import { splitSessions } from '../chat/sessions'
import { markRead } from '../chat/unread'
import { NotationError } from '../dice/notation'
import { poolFormula } from '../dice/pool'
import { stampTime } from '../lib/hlc'
import type { Campaign } from '../store/campaign'
import { device } from '../store/device'
import { useY } from '../store/useY'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { menuTrigger } from '../ui/menuTrigger'
import { IconDelete, IconDice, IconExpand } from '../ui/icons'
import { isFloating, sidebarOpen, activePanel } from './panelLayout'

/*
 * The chat panel: who's here, the log of chat and rolls, the message box
 * (with slash commands), and the quick dice bar.
 */

/** Earlier sessions the reader has opened, as "campaignId:key", for this visit. */
const openSessions = signal<Set<string>>(new Set())

/** Messages from one person within this long share a header. */
const GROUP_MS = 5 * 60 * 1000

const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

export function ChatPanel({ campaign, presence }: { campaign: Campaign; presence: preact.ComponentChildren }) {
  /** Replies only this device sees: /help, and errors. */
  const notes = useSignal<{ id: number; text: string; error?: boolean }[]>([])
  const note = (text: string, error = false) => (notes.value = [...notes.value, { id: Date.now(), text, error }])

  return (
    <div class="chat">
      {presence}
      <ChatLogView campaign={campaign} notes={notes.value} />
      <Composer campaign={campaign} onNote={note} />
    </div>
  )
}

function ChatLogView({ campaign, notes }: { campaign: Campaign; notes: { id: number; text: string; error?: boolean }[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const messages = campaign.chat.messages.value
  const isGm = useY(campaign.members, () => campaign.isGm())
  const here = useY(campaign.members, () => campaign.activeSceneId())
  const sceneIds = useY(campaign.scenes, () => [...campaign.scenes.keys()].join())
  const me = device.value.id
  // Messages already here when the panel opened don't animate in.
  const initial = useRef<Set<string> | null>(null)
  initial.current ??= new Set(messages.map((m) => m.id))

  // Keep the newest message in view, unless the reader has scrolled up.
  useLayoutEffect(() => {
    const el = ref.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [messages.length, notes.length])

  // In view means read.
  const visible = useComputed(() => isFloating('chat') || (sidebarOpen.value && activePanel.value === 'chat'))
  useSignalEffect(() => {
    void campaign.chat.messages.value
    if (visible.value && document.hasFocus()) markRead()
  })
  useEffect(() => {
    window.addEventListener('focus', markRead)
    return () => window.removeEventListener('focus', markRead)
  }, [])

  // Right-click (or long-press) on a message opens its menu.
  const menu = useSignal<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const closeMenu = useCallback(() => (menu.value = null), [])

  const shown = messages.filter((m) => visibilityOf(m, me, isGm) !== 'hidden')
  const parts = splitSessions(shown)
  const isOpen = (key: string) => openSessions.value.has(`${campaign.id}:${key}`)
  const toggle = (key: string) => {
    const k = `${campaign.id}:${key}`
    const next = new Set(openSessions.value)
    if (next.has(k)) next.delete(k)
    else next.add(k)
    openSessions.value = next
  }

  const renderMessages = (list: ChatMessage[]) =>
    list.map((m, i) => {
      const prev = list[i - 1]
      const header =
        m.kind !== 'system' &&
        (!prev || prev.kind === 'system' || prev.author !== m.author || stampTime(m.hlc) - stampTime(prev.hlc) > GROUP_MS)
      const onDelete = canDelete(m, me, isGm) ? () => campaign.chat.remove(m.id) : undefined
      return (
        <Message
          key={m.id}
          m={m}
          header={header}
          fresh={!initial.current!.has(m.id)}
          masked={visibilityOf(m, me, isGm) === 'masked'}
          mine={m.author === me}
          goTo={
            m.kind === 'system' && m.event === 'scene-change' && m.sceneId && m.sceneId !== here && sceneIds.includes(m.sceneId)
              ? () => campaign.setActiveScene(m.sceneId!)
              : undefined
          }
          menu={
            onDelete &&
            menuTrigger((x, y) => {
              menu.value = { x, y, items: [{ label: 'Delete message', Icon: IconDelete, danger: true, onSelect: onDelete }] }
            })
          }
        />
      )
    })

  return (
    <div
      ref={ref}
      class="panel-scroll chat-log"
      role="log"
      aria-live="polite"
      onScroll={(e) => {
        const el = e.currentTarget
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
      }}
    >
      {campaign.chat.hasEarlier.value && (
        <Button variant="ghost" size="sm" class="chat-earlier" onClick={() => campaign.chat.loadEarlier()}>
          Load earlier messages
        </Button>
      )}
      {shown.length === 0 && notes.length === 0 && (
        <div class="empty">
          <IconDice size={28} />
          Say hello, or roll some dice.
        </div>
      )}
      {parts.map((part) => {
        // The current session is always open; earlier ones fold away.
        if (part.current) {
          return (
            <Fragment key={part.key}>
              {part.marker && renderMessages([part.marker])}
              {renderMessages(part.messages)}
            </Fragment>
          )
        }
        const open = isOpen(part.key)
        const title = part.marker ? `Session ${part.marker.session ?? ''}`.trim() : 'Before the first session'
        const count = part.messages.filter((m) => m.kind !== 'system').length
        return (
          <section key={part.key} class="chat-session" data-open={open}>
            <button type="button" class="chat-session-fold" aria-expanded={open} onClick={() => toggle(part.key)}>
              <IconExpand size={16} class="chat-session-chevron" />
              <span class="chat-session-title">{title}</span>
              <span class="chat-session-count">
                {count} {count === 1 ? 'message' : 'messages'}
              </span>
            </button>
            {open && renderMessages(part.messages)}
          </section>
        )
      })}
      {notes.map((n) => (
        <p key={n.id} class="chat-note" data-error={n.error}>
          {n.text}
        </p>
      ))}
      {menu.value && <ContextMenu {...menu.value} onClose={closeMenu} />}
    </div>
  )
}

function Message({
  m,
  header,
  fresh,
  masked,
  mine,
  menu,
  goTo,
}: {
  m: ChatMessage
  header: boolean
  fresh: boolean
  masked: boolean
  mine: boolean
  /** Opens the message's menu; present when there's something in it. */
  menu?: ReturnType<typeof menuTrigger>
  /** For a scene change: join the GM on that scene. */
  goTo?: () => void
}) {
  if (m.kind === 'system') {
    const session = m.event === 'session-start' || m.event === 'session-end'
    return (
      <div class="chat-system" data-session={session} {...menu}>
        <span>{m.text}</span>
        {goTo && (
          <Button variant="ghost" size="sm" class="chat-go" onClick={goTo}>
            Go there
          </Button>
        )}
      </div>
    )
  }
  const whisper = m.kind === 'text' && m.to
  return (
    <article
      class="chat-msg"
      data-header={header}
      data-whisper={!!whisper}
      data-fresh={fresh}
      {...menu}
    >
      {header && (
        <header class="chat-msg-head">
          <Avatar id={m.author} name={m.name} online />
          <span class="chat-author">{m.name}</span>
          <time class="chat-time" dateTime={new Date(stampTime(m.hlc)).toISOString()}>
            {time.format(stampTime(m.hlc))}
          </time>
        </header>
      )}
      {m.kind === 'roll' ? <RollCard m={m} masked={masked} /> : <TextBody m={m} mine={mine} />}
    </article>
  )
}

function TextBody({ m, mine }: { m: TextMessage; mine: boolean }) {
  return (
    <div class="chat-text" data-emote={m.emote}>
      {m.to && <span class="chat-whisper-tag">{mine ? `Whisper to ${m.toNames?.join(', ')}` : 'Whispered to you'}</span>}
      {m.emote && <span class="chat-emote-name">{m.name} </span>}
      <Rich text={m.text} />
    </div>
  )
}

/** Markdown-lite, rendered as elements (never HTML). */
function Rich({ text }: { text: string }) {
  return (
    <>
      {tokenize(text).map((s, i) => {
        const content = s.text.split('\n').map((line, j) => (
          <Fragment key={j}>
            {j > 0 && <br />}
            {line}
          </Fragment>
        ))
        switch (s.type) {
          case 'bold':
            return <strong key={i}>{content}</strong>
          case 'italic':
            return <em key={i}>{content}</em>
          case 'code':
            return <code key={i}>{content}</code>
          case 'link':
            return (
              <a key={i} href={s.href} target="_blank" rel="noreferrer noopener">
                {content}
              </a>
            )
          default:
            return <Fragment key={i}>{content}</Fragment>
        }
      })}
    </>
  )
}

const VISIBILITY_LABEL: Record<RollVisibility, string> = {
  public: '',
  private: 'Secret: you and the GM',
}

function RollCard({ m, masked }: { m: RollMessage; masked: boolean }) {
  if (masked) {
    return (
      <div class="roll-card" data-masked="true">
        <span class="roll-secret">
          {m.name} rolled in secret.
        </span>
      </div>
    )
  }
  const r = m.roll
  return (
    <div class="roll-card" aria-label={`${r.formula}${m.comment ? `, ${m.comment}` : ''}: ${r.total}`}>
      <div class="roll-head">
        <span class="roll-formula">{r.formula}</span>
        {m.comment && <span class="roll-comment">{m.comment}</span>}
        {m.visibility !== 'public' && <span class="roll-visibility">{VISIBILITY_LABEL[m.visibility]}</span>}
      </div>
      <div class="roll-body">
        <div class="roll-terms">
          {r.terms.map((t, i) => (
            <span key={i} class="roll-term">
              {(i > 0 || t.sign < 0) && <span class="roll-op">{t.sign < 0 ? '−' : '+'}</span>}
              {t.kind === 'flat' ? (
                <span class="roll-flat">
                  {t.value}
                  {t.label && <span class="roll-label">{t.label}</span>}
                </span>
              ) : (
                <>
                  {t.dice.map((d, j) => (
                    <span
                      key={j}
                      class="die"
                      data-sides={[4, 6, 8, 10, 12, 20].includes(d.sides) ? d.sides : 'n'}
                      data-kept={d.kept}
                      data-max={d.value === d.sides && d.sides > 1}
                      data-min={d.value === 1}
                      data-exploded={d.exploded}
                      style={{ '--i': j }}
                      title={`d${d.sides}${d.exploded ? ', exploded' : ''}${d.kept ? '' : ', dropped'}`}
                    >
                      {d.value}
                    </span>
                  ))}
                  {t.label && <span class="roll-label">{t.label}</span>}
                </>
              )}
            </span>
          ))}
        </div>
        <span class="roll-total">{r.total}</span>
      </div>
    </div>
  )
}

const VISIBILITIES: { id: RollVisibility; label: string; title: string }[] = [
  { id: 'public', label: 'Public', title: 'Everyone sees the roll' },
  { id: 'private', label: 'Secret', title: 'Only you and the GM see the result' },
]
const DICE = [4, 6, 8, 10, 12, 20]
/** How long after the last quick-dice click the pool rolls. */
const POOL_MS = 1000

/** The message box, its command hints, and the quick dice bar above it. */
function Composer({ campaign, onNote }: { campaign: Campaign; onNote: (text: string, error?: boolean) => void }) {
  const text = useSignal('')
  const error = useSignal<string | null>(null)
  const visibility = useSignal<RollVisibility>('public')
  const last = useRef('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const isGm = useY(campaign.members, () => campaign.isGm())
  const members = useY(campaign.members, () => campaign.memberViews())
  const hints = suggest(text.value, isGm)

  // Grow with the text, up to a few lines.
  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [text.value])

  function send() {
    const input = text.value
    if (!input.trim()) return
    const cmd = parseCommand(input, members, isGm)
    if (cmd.kind === 'error') {
      error.value = cmd.message
      return
    }
    if (cmd.kind === 'help') {
      const lines = COMMANDS.filter((c) => isGm || !c.gmOnly).map((c) => `${c.usage}  ${c.help}`)
      onNote(['Commands:', ...lines, 'Formulas: 2d6+1, 4d6kh3, 2d20kl1, d6!, 1d8+2[STR]'].join('\n'))
    } else {
      // A roll typed with /r uses its own visibility; quick dice use the toggle.
      runCommand(campaign, cmd)
    }
    last.current = input
    text.value = ''
    error.value = null
  }

  // Quick dice gather into a pool, rolled together once the clicks stop:
  // clicking the d20 twice rolls 2d20 as one entry.
  const pool = useSignal<number[]>([])
  const poolTimer = useRef(0)
  const rollPoolRef = useRef<() => void>(() => {})

  function rollPool() {
    clearTimeout(poolTimer.current)
    const picked = pool.value
    pool.value = []
    if (!picked.length) return
    try {
      postRoll(campaign, poolFormula(picked), visibility.value)
    } catch (e) {
      if (e instanceof NotationError) error.value = e.message
    }
  }
  rollPoolRef.current = rollPool

  function restartPoolTimer() {
    clearTimeout(poolTimer.current)
    if (pool.value.length) poolTimer.current = window.setTimeout(() => rollPoolRef.current(), POOL_MS)
  }

  function addDie(sides: number) {
    pool.value = [...pool.value, sides]
    restartPoolTimer()
  }

  /** Right-click while pooling: take one of these dice back out. */
  function removeDie(sides: number) {
    const i = pool.value.lastIndexOf(sides)
    if (i < 0) return
    pool.value = pool.value.filter((_, j) => j !== i)
    restartPoolTimer()
  }
  // Dice picked just before the panel closes still get rolled.
  useEffect(() => () => rollPoolRef.current(), [])

  const nextVisibility = () => {
    const options = VISIBILITIES.map((v) => v.id)
    visibility.value = options[(options.indexOf(visibility.value) + 1) % options.length]
  }
  const vis = VISIBILITIES.find((v) => v.id === visibility.value)!

  return (
    <div class="dice-tray">
      <div class="dice-quick">
        {DICE.map((sides) => {
          const n = pool.value.filter((p) => p === sides).length
          return (
            <Button
              key={sides}
              variant="ghost"
              size="sm"
              class="dice-pick"
              data-count={n || undefined}
              label={
                n
                  ? `Add another d${sides} (${n} so far; right-click to remove one)`
                  : `Roll a d${sides} (click again for more)`
              }
              onClick={() => addDie(sides)}
              onContextMenu={(e) => {
                if (!pool.value.length) return
                e.preventDefault()
                removeDie(sides)
              }}
            >
              d{sides}
            </Button>
          )
        })}
        {pool.value.length ? (
          // Restarted on every change, so the fill shows time left before the roll.
          <Button
            key={pool.value.join()}
            variant="secondary"
            size="sm"
            class="dice-roll-now"
            style={{ '--pool-ms': `${POOL_MS}ms` }}
            label={`Roll ${poolFormula(pool.value)} now`}
            onClick={rollPool}
          >
            {poolFormula(pool.value).replace(/\b1d/g, 'd')}
          </Button>
        ) : (
          <Button variant="ghost" size="sm" class="dice-visibility" label={vis.title} onClick={nextVisibility}>
            {vis.label}
          </Button>
        )}
      </div>
      {hints.length > 0 && (
        <ul class="chat-hints" role="listbox" aria-label="Commands">
          {hints.map((h) => (
            <li key={h.names[0]}>
              <button
                type="button"
                class="chat-hint"
                onClick={() => {
                  text.value = `/${h.names[0]} `
                  inputRef.current?.focus()
                }}
              >
                <code>{h.usage}</code>
                <span>{h.help}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        class="dice-entry"
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <textarea
          ref={inputRef}
          class="input bevel chat-input"
          rows={1}
          value={text.value}
          placeholder="Message, or /r 2d6+1"
          aria-label="Message"
          aria-invalid={!!error.value}
          onInput={(e) => {
            text.value = e.currentTarget.value
            error.value = null
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
              e.preventDefault()
              send()
            } else if (e.key === 'ArrowUp' && !text.value && last.current) {
              e.preventDefault()
              text.value = last.current
            } else if (e.key === 'Escape' && text.value) {
              e.stopPropagation()
              text.value = ''
              error.value = null
            }
          }}
        />
        <Button variant="primary" size="sm" type="submit" label="Send" disabled={!text.value.trim()}>
          Send
        </Button>
      </form>
      {error.value && (
        <p class="chat-error" role="alert">
          {error.value}
        </p>
      )}
    </div>
  )
}
