import { signal, useComputed, useSignal, useSignalEffect } from '@preact/signals'
import { Fragment } from 'preact'
import { memo } from 'preact/compat'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'preact/hooks'
import { COMMANDS, parseCommand, suggest } from '../chat/commands'
import { tokenize } from '../chat/markdown'
import { postRoll, runCommand } from '../chat/send'
import type { ChatMessage, MoveMessage, RollMessage, RollVisibility, TextMessage } from '../chat/types'
import { canDelete, visibilityOf } from '../chat/types'
import { logRows, type LogRow } from '../chat/sessions'
import { markRead } from '../chat/unread'
import { clearState } from '../chat/messageState'
import { NotationError, type Roll } from '../dice/notation'
import { applySuggestion, canEdit, getCharacter, systemOf } from '../characters/api'
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
import { ChatInput, type ChatInputHandle } from './ChatInput'
import { entityToken } from '../chat/markdown'
import { registerLinkDrop } from './entityDrag'
import { LinkChip } from './LinkChip'
import { DamageTargets, SaveRequests, TargetRolls } from './CardParts'
import { panelVisible } from './panelLayout'

/*
 * The chat panel: who's here, the log of chat and rolls, the message box
 * (with slash commands), and the quick dice bar.
 */

/** Earlier sessions the reader has opened, as "campaignId:key", for this visit. */
const openSessions = signal<Set<string>>(new Set())

/*
 * A log can run to thousands of messages, so only a window of rows is
 * rendered: the newest WINDOW to begin with. Scrolling near either end of
 * what's rendered slides the window that way, a STEP at a time, trimming the
 * other end once it holds MAX_ROWS; reaching the oldest loaded message loads
 * the chunk before it. The window is kept by row keys, so rows arriving or
 * loading outside it don't move it.
 *
 * Spacers above and below stand in for the rows that aren't rendered, so the
 * scrollbar is sized to the whole history: rows that have been on screen
 * count at their measured height, others (and chunks not loaded yet) at the
 * average. Dragging the scrollbar past what's rendered moves the window to
 * where it lands, loading older chunks if that's where it is.
 */
const WINDOW = 100
const STEP = 50
const MAX_ROWS = 250
/** How close to the end of what's rendered (in px) before more is rendered. */
const NEAR_PX = 800
/** The space between rows (--space-1). */
const ROW_GAP = 4
/** A row's height before it has been measured, until there's an average. */
const ROW_GUESS = 64
/** Rows rendered above the one a jump lands on. */
const JUMP_LEAD = 20

/** Where the window starts and ends: null means "WINDOW rows before the end" and "the newest row". */
type Span = { start: string | null; end: string | null }

const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

/** The ids of the characters this device may change, as one string (so it compares by value). */
const editableIds = (campaign: Campaign) =>
  [...campaign.characters.keys()].filter((id) => {
    const c = getCharacter(campaign, id)
    return !!c && canEdit(campaign, c)
  }).join(' ')

export function ChatPanel({ campaign }: { campaign: Campaign }) {
  /** Replies only this device sees: /help, and errors. */
  const notes = useSignal<{ id: number; text: string; error?: boolean }[]>([])
  const note = (text: string, error = false) => (notes.value = [...notes.value, { id: Date.now(), text, error }])
  const ref = useRef<HTMLDivElement>(null)

  // Something dragged onto the chat is sent as a link (into the message box, it joins the message instead).
  useEffect(() => {
    if (!ref.current) return
    return registerLinkDrop(ref.current, (link) => runCommand(campaign, { kind: 'text', text: entityToken(link.kind, link.id) }))
  }, [campaign])

  return (
    <div class="chat" ref={ref}>
      <ChatLogView campaign={campaign} notes={notes.value} />
      <Composer campaign={campaign} onNote={note} />
    </div>
  )
}

/** Delete a message and whatever was recorded about it. */
function removeMessage(campaign: Campaign, id: string) {
  campaign.doc.transact(() => {
    campaign.chat.remove(id)
    clearState(campaign.messageState, id)
  })
}

function ChatLogView({ campaign, notes }: { campaign: Campaign; notes: { id: number; text: string; error?: boolean }[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  /** Following the newest message at the bottom. */
  const stick = useRef(true)
  const messages = campaign.chat.messages.value
  const isGm = useY(campaign.members, () => campaign.isGm())
  const here = useY(campaign.members, () => campaign.activeSceneId())
  const sceneIds = useY(campaign.scenes, () => [...campaign.scenes.keys()].join())
  // One subscription for every move card's follow-up buttons, rather than one per card.
  const editable = useY(campaign.characters, () => editableIds(campaign))
  const me = device.value.id
  // Messages already here when the panel opened don't animate in.
  const initial = useRef<Set<string> | null>(null)
  initial.current ??= new Set(messages.map((m) => m.id))

  // In view means read.
  const visible = useComputed(() => panelVisible('chat'))
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
  const openMenu = useCallback(
    (x: number, y: number, id: string) => {
      menu.value = { x, y, items: [{ label: 'Delete message', Icon: IconDelete, danger: true, onSelect: () => removeMessage(campaign, id) }] }
    },
    [campaign],
  )

  const opened = openSessions.value
  const rows = useMemo(
    () =>
      logRows(
        messages.filter((m) => visibilityOf(m, me, isGm) !== 'hidden'),
        (key) => opened.has(`${campaign.id}:${key}`),
      ),
    [messages, me, isGm, opened, campaign],
  )
  const toggle = (key: string) => {
    const k = `${campaign.id}:${key}`
    const next = new Set(openSessions.value)
    if (next.has(k)) next.delete(k)
    else next.add(k)
    openSessions.value = next
  }

  // The window, as indices into rows.
  const span = useSignal<Span>({ start: null, end: null })
  const indexOf = (key: string | null) => (key === null ? -1 : rows.findIndex((r) => r.key === key))
  const endKeyAt = indexOf(span.value.end)
  const endIdx = span.value.end === null || endKeyAt < 0 ? rows.length : endKeyAt + 1
  const startKeyAt = indexOf(span.value.start)
  const startIdx = span.value.start === null || startKeyAt < 0 || startKeyAt >= endIdx ? Math.max(0, endIdx - WINDOW) : startKeyAt
  const atNewest = endIdx === rows.length
  const shown = rows.slice(startIdx, endIdx)

  // Row heights (with the gap after them), measured as rows render; kept for this view.
  const heights = useRef(new Map<string, number>())
  const measured = heights.current
  // Re-render once new rows are measured, so the spacers use the better average.
  const measuredCount = useSignal(0)
  void measuredCount.value
  let total = 0
  for (const h of measured.values()) total += h
  const guess = measured.size ? total / measured.size : ROW_GUESS
  const heightOf = (r: LogRow) => measured.get(r.key) ?? guess
  const earlierCount = campaign.chat.earlierCount.value
  const unloaded = earlierCount * guess
  let above = unloaded
  for (let i = 0; i < startIdx; i++) above += heightOf(rows[i]!)
  let below = 0
  for (let i = endIdx; i < rows.length; i++) below += heightOf(rows[i]!)

  const setSpan = (from: number, to: number) => {
    const next = { start: rows[from]?.key ?? null, end: to >= rows.length ? null : rows[to - 1]!.key }
    // Unchanged, it mustn't re-render: slide() runs after every render.
    if (next.start !== span.peek().start || next.end !== span.peek().end) span.value = next
  }
  const loading = useSignal(false)
  // Read so finishing a load re-renders, and slide() can ask for the next chunk.
  void loading.value
  const loadEarlier = () => {
    if (!campaign.chat.hasEarlier.peek() || loading.peek()) return
    loading.value = true
    void campaign.chat.loadEarlier().finally(() => (loading.value = false))
  }
  /** Set when the window moves to where the scrollbar was dragged: the spacers place it, so no anchoring. */
  const jumped = useRef(false)
  /** Render the rows around a point in the log, `y` px below the top of everything above the rows. */
  const jumpTo = (y: number) => {
    jumped.current = true
    if (y < unloaded) {
      // Into chunks that aren't loaded: load the next one back; this runs again once it's in.
      setSpan(0, Math.min(rows.length, WINDOW))
      loadEarlier()
      return
    }
    let i = 0
    for (let acc = unloaded; i < rows.length - 1 && acc + heightOf(rows[i]!) <= y; i++) acc += heightOf(rows[i]!)
    const from = Math.max(0, i - JUMP_LEAD)
    setSpan(from, Math.min(rows.length, from + WINDOW))
  }
  const slide = () => {
    const el = ref.current
    const rowsEl = list.current
    if (!el || !rowsEl) return
    const box = el.getBoundingClientRect()
    const top = el.scrollTop
    const bottom = top + el.clientHeight
    // Where the rendered rows are, in the log's scrolled content.
    const rowsTop = rowsEl.getBoundingClientRect().top - box.top + top
    const rowsBottom = rowsTop + rowsEl.offsetHeight
    const origin = rowsTop - above
    if (bottom < rowsTop || top > rowsBottom) jumpTo(top - origin)
    else if (top - rowsTop < NEAR_PX && (startIdx > 0 || earlierCount > 0)) {
      if (startIdx > 0) {
        const from = Math.max(0, startIdx - STEP)
        setSpan(from, Math.min(endIdx, from + MAX_ROWS))
      } else loadEarlier()
    } else if (rowsBottom - bottom < NEAR_PX && !atNewest) {
      const to = Math.min(rows.length, endIdx + STEP)
      setSpan(Math.max(startIdx, to - MAX_ROWS), to)
    } else if (stick.current && endIdx - startIdx > MAX_ROWS) {
      // Back at the newest after reading far up: let go of the old rows.
      span.value = { start: null, end: null }
    }
  }

  // Keep what's on screen where it is while rows come and go around it: note
  // where a row in view sits before rendering, and put it back after.
  const anchor = useRef<{ key: string; top: number } | null>(null)
  const el = ref.current
  if (el && !stick.current && !jumped.current) {
    const { top, bottom } = el.getBoundingClientRect()
    // Only a row actually in view. Over a spacer there is none, and the scroll position stays put for slide() to fill.
    const row = [...(list.current?.children ?? [])].find((r) => {
      const box = r.getBoundingClientRect()
      return box.bottom > top && box.top < bottom
    }) as HTMLElement | undefined
    anchor.current = row?.dataset.key ? { key: row.dataset.key, top: row.getBoundingClientRect().top - top } : null
  } else anchor.current = null

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    for (const row of list.current?.children ?? []) {
      const key = (row as HTMLElement).dataset.key
      if (key) measured.set(key, (row as HTMLElement).offsetHeight + ROW_GAP)
    }
    if (measured.size !== measuredCount.peek()) measuredCount.value = measured.size
    if (stick.current) el.scrollTop = el.scrollHeight
    else if (anchor.current) {
      const row = list.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(anchor.current.key)}"]`)
      if (row) el.scrollTop += row.getBoundingClientRect().top - el.getBoundingClientRect().top - anchor.current.top
    }
    jumped.current = false
    // The window may still not reach far enough (a short window, rows just loaded, or a jump into unloaded chunks).
    slide()
  })

  // Rows change size after they render (dice settling, fonts, images): stay at the bottom.
  useEffect(() => {
    const el = ref.current
    if (!el || !list.current) return
    const ro = new ResizeObserver(() => {
      if (stick.current) el.scrollTop = el.scrollHeight
    })
    ro.observe(list.current)
    return () => ro.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      class="panel-scroll chat-log"
      role="log"
      aria-live="polite"
      onScroll={(e) => {
        const el = e.currentTarget
        stick.current = atNewest && el.scrollHeight - el.scrollTop - el.clientHeight < 40
        slide()
      }}
    >
      {rows.length === 0 && notes.length === 0 && (
        <div class="empty">
          <IconDice size={28} />
          Say hello, or roll some dice.
        </div>
      )}
      <div class="chat-space" style={{ height: `${Math.round(above)}px` }} aria-hidden="true" />
      <div ref={list} class="chat-rows">
        {shown.map((row) =>
          row.kind === 'fold' ? (
            <button key={row.key} data-key={row.key} type="button" class="chat-session-fold" aria-expanded={row.open} onClick={() => toggle(row.part)}>
              <IconExpand size={16} class="chat-session-chevron" />
              <span class="chat-session-title">{row.title}</span>
              <span class="chat-session-count">
                {row.count} {row.count === 1 ? 'message' : 'messages'}
              </span>
            </button>
          ) : (
            <Message
              key={row.key}
              campaign={campaign}
              m={row.m}
              header={row.header}
              fresh={!initial.current!.has(row.m.id)}
              masked={visibilityOf(row.m, me, isGm) === 'masked'}
              mine={row.m.author === me}
              canAct={row.m.kind === 'move' && editable.split(' ').includes(row.m.characterId)}
              canGo={row.m.kind === 'system' && row.m.event === 'scene-change' && !!row.m.sceneId && row.m.sceneId !== here && sceneIds.includes(row.m.sceneId)}
              onMenu={canDelete(row.m, me, isGm) ? openMenu : undefined}
            />
          ),
        )}
      </div>
      <div class="chat-space" style={{ height: `${Math.round(below)}px` }} aria-hidden="true" />
      {atNewest &&
        notes.map((n) => (
          <p key={n.id} class="chat-note" data-error={n.error}>
            {n.text}
          </p>
        ))}
      {menu.value && <ContextMenu {...menu.value} onClose={closeMenu} />}
    </div>
  )
}

/** One message on its own, as it shows in the log: for chat popping up outside the panel. */
export function LoneMessage({ campaign, m }: { campaign: Campaign; m: ChatMessage }) {
  const canAct = useY(campaign.characters, () => {
    const c = m.kind === 'move' ? getCharacter(campaign, m.characterId) : undefined
    return !!c && canEdit(campaign, c)
  })
  return <Message campaign={campaign} m={m} header fresh masked={false} mine={m.author === device.value.id} canAct={canAct} />
}

type MessageProps = {
  campaign: Campaign
  m: ChatMessage
  header: boolean
  fresh: boolean
  masked: boolean
  mine: boolean
  /** For a move: whether its follow-up buttons may be used. */
  canAct: boolean
  /** For a scene change: offer to join the GM on that scene. */
  canGo?: boolean
  /** Opens the message's menu; present when there's something in it. */
  onMenu?: (x: number, y: number, id: string) => void
}

/** Memoised: the log re-renders as messages arrive, but a message only when its own props change. */
const Message = memo(function Message({ campaign, m, header, fresh, masked, mine, canAct, canGo, onMenu }: MessageProps) {
  const menu = useMemo(() => onMenu && menuTrigger((x, y) => onMenu(x, y, m.id)), [onMenu, m.id])
  if (m.kind === 'system') {
    const session = m.event === 'session-start' || m.event === 'session-end'
    return (
      <div class="chat-system" data-key={m.id} data-session={session} {...menu}>
        <span>{m.text}</span>
        {canGo && (
          <Button variant="ghost" size="sm" class="chat-go" onClick={() => campaign.setActiveScene(m.sceneId!)}>
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
      data-key={m.id}
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
      {m.kind === 'roll' ? (
        <RollCard campaign={campaign} m={m} masked={masked} />
      ) : m.kind === 'move' ? (
        <MoveCard campaign={campaign} m={m} canAct={canAct} />
      ) : (
        <TextBody campaign={campaign} m={m} mine={mine} />
      )}
    </article>
  )
})

function TextBody({ campaign, m, mine }: { campaign: Campaign; m: TextMessage; mine: boolean }) {
  return (
    <div class="chat-text" data-emote={m.emote}>
      {m.to && <span class="chat-whisper-tag">{mine ? `Whisper to ${m.toNames?.join(', ')}` : 'Whispered to you'}</span>}
      {m.emote && <span class="chat-emote-name">{m.name} </span>}
      <Rich campaign={campaign} text={m.text} />
    </div>
  )
}

/** Markdown-lite, rendered as elements (never HTML). */
function Rich({ campaign, text }: { campaign: Campaign; text: string }) {
  return (
    <>
      {tokenize(text).map((s, i) => {
        if (s.type === 'entity') return <LinkChip key={i} campaign={campaign} kind={s.kind} id={s.id} text={s.text} />
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

function RollCard({ campaign, m, masked }: { campaign: Campaign; m: RollMessage; masked: boolean }) {
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
        <RollTerms roll={r} />
        <span class="roll-total">{r.total}</span>
      </div>
      {m.damage && <DamageTargets campaign={campaign} m={m} />}
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
  const input = useRef<ChatInputHandle | null>(null)
  const isGm = useY(campaign.members, () => campaign.isGm())
  const members = useY(campaign.members, () => campaign.memberViews())
  const hints = suggest(text.value, isGm)

  function send() {
    const typed = text.value
    if (!typed.trim()) return
    const cmd = parseCommand(typed, members, isGm)
    if (cmd.kind === 'error') {
      error.value = cmd.message
      return
    }
    if (cmd.kind === 'help') {
      const lines = COMMANDS.filter((c) => isGm || !c.gmOnly).map((c) => `${c.usage}  ${c.help}`)
      onNote(['Commands:', ...lines, 'Formulas: 2d6+1, 4d6kh3, 2d20kl1, d6!, 1d8+2[STR]'].join('\n'))
    } else {
      // A roll typed with /r or /sr uses its own visibility; quick dice and a bare formula use the toggle.
      const bare = cmd.kind === 'roll' && !typed.trim().startsWith('/')
      runCommand(campaign, bare ? { ...cmd, visibility: visibility.value } : cmd)
    }
    last.current = typed
    input.current?.set('')
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
                onClick={() => input.current?.set(`/${h.names[0]} `)}
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
        <ChatInput
          campaign={campaign}
          handle={input}
          placeholder="Message, @ to link, or roll 2d6+1"
          label="Message"
          invalid={!!error.value}
          onChange={(t) => {
            text.value = t
            error.value = null
          }}
          onEnter={send}
          onUp={() => last.current && input.current?.set(last.current)}
          onEscape={() => {
            input.current?.set('')
            error.value = null
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

function RollTerms({ roll }: { roll: Roll }) {
  return (
    <div class="roll-terms">
      {roll.terms.map((t, i) => (
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
  )
}

/** A move: its name, the roll behind it, the outcome, and follow-up buttons. */
function MoveCard({ campaign, m, canAct }: { campaign: Campaign; m: MoveMessage; canAct: boolean }) {
  const result = m.result ? systemOf(campaign).results.find((r) => r.id === m.result) : undefined
  const label = result ? result.label : m.result
  return (
    <div class="roll-card move-card" data-band={result?.tone ?? 'none'}>
      <div class="roll-head">
        <span class="roll-formula">{m.moveName}</span>
        <span class="roll-comment">{m.characterName}</span>
      </div>
      {m.targets?.some((t) => t.roll) ? (
        <TargetRolls campaign={campaign} m={m} />
      ) : m.targets && !m.save && (
        <p class="move-targets">
          <span class="muted">Targeting</span>{' '}
          {m.targets.map((t, i) => (
            <span key={t.id}>
              {i > 0 && ', '}
              {t.name}
              {t.distance && <span class="muted"> ({t.distance})</span>}
            </span>
          ))}
        </p>
      )}
      {m.roll && (
        <div class="roll-body">
          <RollTerms roll={m.roll} />
          <span class="roll-total">{m.roll.total}</span>
        </div>
      )}
      {label && <div class="move-band">{label}</div>}
      <p class="move-outcome">{m.outcome}</p>
      {m.save && <SaveRequests campaign={campaign} m={m} />}
      {canAct && m.suggestions.length > 0 && (
        <div class="move-suggest">
          {m.suggestions.map((s, i) => (
            <Button key={i} size="sm" variant="ghost" onClick={() => applySuggestion(campaign, m.characterId, s)}>
              {s.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}

