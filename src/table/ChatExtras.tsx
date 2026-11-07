import type * as React from "react";
import { signal, useSignal } from "@preact/signals-react";
import { useEffect, useEffectEvent, useRef } from "react";
import { fieldsOf, getState, setState, withField } from "../features/chat/messageState";
import {
  commandText,
  contentForCommand,
  type ChatContent,
} from "../features/chat/content";
import {
  canWork,
  visibilityOf,
  type ChatMessage,
  type CounterMessage,
  type TimerMessage,
} from "../features/chat/types";
import type { Campaign } from "../campaign/campaign";
import { device } from "../platform/device";
import { useY } from "../ui/useY";
import { Button } from "../ui/Button";
import { menuTrigger } from "../ui/menuTrigger";
import { IconRemove, IconAdd } from "../ui/icons";
import { ChatInput, type ChatInputHandle } from "./ChatInput";

/*
 * What chat messages gained in M10, all kept in the campaign's message state
 * (chat/messageState.ts) since messages themselves never change: edits to
 * text, pins (shown in a strip above the log), and the live parts of timers
 * and counters.
 */

/** The message being edited in place, on this device. */
export const editingMessage = signal<string | null>(null);

/** Some of a message's state, re-read when it changes. */
export function useMessageState<T = unknown>(
  campaign: Campaign,
  id: string,
  fields: string[],
): Record<string, T> {
  return JSON.parse(
    useY(campaign.messageState, () =>
      JSON.stringify(fieldsOf(campaign.messageState, id, fields)),
    ),
  ) as Record<string, T>;
}

const TEXT_FIELDS = ["text", "editedAt"];
/** An edited text message's state. */
export const useTextState = (campaign: Campaign, id: string) =>
  useMessageState<ChatContent | number>(campaign, id, TEXT_FIELDS);

/** Text as last edited, or as sent. */
export const editedText = (
  state: Record<string, unknown>,
  text: ChatContent,
): ChatContent => (state.text as ChatContent | undefined) ?? text;

export function saveEdit(campaign: Campaign, id: string, text: ChatContent) {
  campaign.doc.transact(() => {
    setState(campaign.messageState, id, "text", text);
    setState(campaign.messageState, id, "editedAt", Date.now());
  });
}

export const isPinned = (campaign: Campaign, id: string) =>
  !!getState<boolean>(campaign.messageState, id, "pinned");
export const setPinned = (campaign: Campaign, id: string, on: boolean) =>
  setState(campaign.messageState, id, "pinned", on || undefined);

/** The box a message is edited in: Enter saves, Escape leaves it as it was. */
export function EditBox({
  campaign,
  id,
  text,
}: {
  campaign: Campaign;
  id: string;
  text: ChatContent;
}) {
  const value = useSignal<ChatContent>(text);
  const input = useRef<ChatInputHandle | null>(null);
  const done = (save: boolean) => {
    const body = commandText(value.value).trim();
    const content = contentForCommand(value.value, body);
    if (save && body && JSON.stringify(content) !== JSON.stringify(text))
      saveEdit(campaign, id, content);
    editingMessage.value = null;
  };
  return (
    <div
      className="chat-edit"
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (!next || !event.currentTarget.contains(next)) done(true);
      }}
    >
      <ChatInput
        campaign={campaign}
        placeholder=""
        label="Edit message"
        invalid={false}
        className="input chat-input"
        initialContent={text}
        handle={input}
        onChange={(content) => (value.value = content)}
        onEnter={() => done(true)}
        onUp={() => {}}
        onEscape={() => done(false)}
      />
    </div>
  );
}

/** The clock now, ticking every half second while something needs it. */
function useNow(running: boolean): number {
  const now = useSignal(Date.now());
  const updateNow = useEffectEvent(() => (now.value = Date.now()));
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(updateNow, 500);
    return () => clearInterval(t);
  }, [running]);
  return now.value;
}

const clock = (seconds: number) => {
  const s = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
};

/** How long a timer's bar flashes when it runs out, while the page is in view. */
const RING_MS = 3600;

/**
 * Whether a timer is ringing: from the moment it runs out while on screen,
 * for a few seconds of the page being visible (so running out in a
 * background tab still rings on coming back). One already out when it
 * appears doesn't ring.
 */
function useRinging(done: boolean): boolean {
  const ringing = useSignal(false);
  const was = useRef(done);
  useEffect(() => {
    if (done && !was.current) ringing.value = true;
    if (!done) ringing.value = false;
    was.current = done;
  }, [done, ringing]);
  useEffect(() => {
    if (!ringing.value) return;
    let timer = 0;
    const arm = () => {
      clearTimeout(timer);
      if (document.visibilityState === "visible")
        timer = window.setTimeout(() => (ringing.value = false), RING_MS);
    };
    arm();
    document.addEventListener("visibilitychange", arm);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", arm);
    };
  }, [ringing, ringing.value]);
  return ringing.value;
}

/** A countdown in real time: its label, the time left as a clock and a bar; restart or stop for whoever may. */
export function TimerCard({
  campaign,
  m,
  compact,
}: {
  campaign: Campaign;
  m: TimerMessage;
  compact?: boolean;
}) {
  const state = useMessageState<number>(campaign, m.id, ["endsAt", "stoppedAt"]);
  const endsAt: number = state.endsAt ?? m.endsAt;
  const stopped: number | undefined = state.stoppedAt;
  const now = useNow(!stopped);
  const left = (((stopped ?? now) - endsAt) * -1) / 1000;
  const done = left <= 0;
  const gm = useY(campaign.members, () => campaign.isGm());
  const can = canWork(m, device.value.id, gm);
  const ringing = useRinging(done);
  return (
    <div
      className="roll-card chat-timer"
      data-done={done || undefined}
      data-ringing={ringing || undefined}
      data-compact={compact || undefined}
    >
      <div className="roll-head">
        <span className="roll-formula">{m.label || "Timer"}</span>
        <span className="chat-timer-clock" aria-live={done ? "polite" : "off"}>
          {done
            ? "Time’s up"
            : stopped
              ? `${clock(left)} stopped`
              : clock(left)}
        </span>
      </div>
      <div className="chat-bar" aria-hidden="true">
        <span
          style={{
            width: `${Math.max(0, Math.min(1, left / m.seconds)) * 100}%`,
          }}
        />
      </div>
      {can && !compact && (
        <div className="move-suggest">
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              campaign.doc.transact(() => {
                setState(
                  campaign.messageState,
                  m.id,
                  "endsAt",
                  Date.now() + m.seconds * 1000,
                );
                setState(campaign.messageState, m.id, "stoppedAt", undefined);
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
                    setState(
                      campaign.messageState,
                      m.id,
                      "endsAt",
                      Date.now() + (endsAt - stopped),
                    );
                    setState(
                      campaign.messageState,
                      m.id,
                      "stoppedAt",
                      undefined,
                    );
                  })
                }
              >
                Resume
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setState(campaign.messageState, m.id, "stoppedAt", Date.now())
                }
              >
                Stop
              </Button>
            ))}
        </div>
      )}
    </div>
  );
}

/** A counter moved by hand: its value (out of its maximum), as pips when there are few. */
export function CounterCard({
  campaign,
  m,
  compact,
}: {
  campaign: Campaign;
  m: CounterMessage;
  compact?: boolean;
}) {
  const state = useMessageState<number>(campaign, m.id, ["value"]);
  const value: number = state.value ?? m.start;
  const gm = useY(campaign.members, () => campaign.isGm());
  const can = canWork(m, device.value.id, gm);
  const set = (n: number) =>
    setState(
      campaign.messageState,
      m.id,
      "value",
      m.max !== undefined ? Math.min(m.max, Math.max(0, n)) : n,
    );
  const full = m.max !== undefined && value >= m.max;
  return (
    <div
      className="roll-card chat-counter"
      data-done={full || undefined}
      data-compact={compact || undefined}
    >
      <div className="roll-head">
        <span className="roll-formula">{m.label || "Counter"}</span>
        <span className="chat-counter-value">
          {can && (
            <Button
              variant="icon"
              size="sm"
              label="Down one"
              disabled={m.max !== undefined && value <= 0}
              onClick={() => set(value - 1)}
            >
              <IconRemove />
            </Button>
          )}
          <span>
            {value}
            {m.max !== undefined && <span className="muted">/{m.max}</span>}
          </span>
          {can && (
            <Button
              variant="icon"
              size="sm"
              label="Up one"
              disabled={full}
              onClick={() => set(value + 1)}
            >
              <IconAdd />
            </Button>
          )}
        </span>
      </div>
      {m.max !== undefined &&
        (m.max <= 12 ? (
          <div className="chat-pips" aria-hidden="true">
            {Array.from({ length: m.max }, (_, i) => (
              <span key={i} data-on={i < value || undefined} />
            ))}
          </div>
        ) : (
          <div className="chat-bar" aria-hidden="true">
            <span style={{ width: `${(Math.max(0, value) / m.max) * 100}%` }} />
          </div>
        ))}
    </div>
  );
}

/** How long an unpinned message takes to leave the strip; matches the CSS. */
const PIN_LEAVE_MS = 240;

/**
 * Pinned messages float over the log, each unpinnable by the GM.
 * Pins slide in when pinned and fold away
 * when unpinned; those already pinned when the strip appears don't animate.
 */
export function PinnedStrip({
  campaign,
  render,
  onMenu,
}: {
  campaign: Campaign;
  render: (m: ChatMessage) => React.ReactNode;
  onMenu: (x: number, y: number, id: string) => void;
}) {
  const pinnedIds = useY(campaign.messageState, () =>
    withField(campaign.messageState, "pinned").join(" "),
  );
  const messages = campaign.chat.messages.value;
  const gm = useY(campaign.members, () => campaign.isGm());
  const me = device.value.id;
  const ids = new Set(pinnedIds.split(" ").filter(Boolean));
  const pinned = messages.filter(
    (m) => ids.has(m.id) && visibilityOf(m, me, gm) === "full",
  );
  const shownIds = pinned.map((m) => m.id).join(" ");
  const shown = new Set(shownIds.split(" ").filter(Boolean));

  // Unpinned ones stay a moment to fold away.
  const leaving = useSignal<Set<string>>(new Set());
  const before = useRef<Set<string>>(shown);
  useEffect(() => {
    const currentShown = new Set(shownIds.split(" ").filter(Boolean));
    const gone = [...before.current].filter((id) => !currentShown.has(id));
    before.current = currentShown;
    if (!gone.length) return;
    leaving.value = new Set([...leaving.value, ...gone]);
    window.setTimeout(
      () =>
        (leaving.value = new Set(
          [...leaving.value].filter((id) => !gone.includes(id)),
        )),
      PIN_LEAVE_MS,
    );
  }, [shownIds, leaving]);
  // Those here when the strip first drew came with it.
  const initial = useRef(shown).current;

  const rows = messages.filter(
    (m) => shown.has(m.id) || leaving.value.has(m.id),
  );
  if (!rows.length) return null;
  return (
    <section className="chat-pinned" aria-label="Pinned">
      <div className="chat-pin-stack">
        {rows.map((m) => (
          <div
            key={m.id}
            className="chat-pin"
            data-new={!initial.has(m.id) || undefined}
            data-leaving={!shown.has(m.id) || undefined}
            tabIndex={gm && shown.has(m.id) ? 0 : undefined}
            aria-label={
              gm && shown.has(m.id)
                ? `Pinned message from ${m.name}`
                : undefined
            }
            {...(gm && shown.has(m.id)
              ? menuTrigger((x, y) => onMenu(x, y, m.id))
              : {})}
          >
            <div className="chat-pin-body">{render(m)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
