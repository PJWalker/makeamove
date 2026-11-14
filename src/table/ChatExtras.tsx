import type * as React from "react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useConstant } from "../ui/useConstant";
import { withField, useMessageState } from "../features/chat/messageState";
import { commandText, contentForCommand, type ChatContent } from "../features/chat/content";
import {
  visibilityOf,
  type ChatMessage,
  type CounterMessage,
  type TimerMessage,
} from "../features/chat/types";
import type { Campaign } from "../campaign/campaign";
import { device } from "../platform/device";
import { useQuery } from "../ui/useQuery";
import { Button } from "../ui/Button";
import { menuTrigger } from "../ui/menuTrigger";
import { IconRemove, IconAdd } from "../ui/icons";
import { ChatInput, type ChatInputHandle } from "./ChatInput";
import { useCampaign } from "../workspace/campaignContext";
import { saveMessageEdit, setCounterValue, timerControl } from "../workspace/commands/chat";

/*
 * What chat messages gained in M10, all kept in the campaign's message state
 * (chat/messageState.ts) since messages themselves never change: edits to
 * text, pins (shown in a strip above the log), and the live parts of timers
 * and counters.
 */

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
  const ctx = useCampaign();
  const value = useRef(text);
  const input = useRef<ChatInputHandle | null>(null);
  const done = (save: boolean) => {
    const body = commandText(value.current).trim();
    const content = contentForCommand(value.current, body);
    if (save && body && JSON.stringify(content) !== JSON.stringify(text))
      ctx.execute(saveMessageEdit, { id, content });
    ctx.table.editingMessage.set(null);
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
        handleRef={input}
        onChange={(content) => {
          value.current = content;
        }}
        onEnter={() => done(true)}
        onUp={() => {}}
        onEscape={() => done(false)}
      />
    </div>
  );
}

/** The clock now, ticking every half second while something needs it. */
function useNow(running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  const updateNow = useEffectEvent(() => setNow(Date.now()));
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(updateNow, 500);
    return () => clearInterval(t);
  }, [running]);
  return now;
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
  const [ringing, setRinging] = useState(false);
  const [was, setWas] = useState(done);
  if (done !== was) {
    setWas(done);
    setRinging(done);
  }
  useEffect(() => {
    if (!ringing) return;
    let timer = 0;
    const arm = () => {
      clearTimeout(timer);
      if (document.visibilityState === "visible")
        timer = window.setTimeout(() => setRinging(false), RING_MS);
    };
    arm();
    document.addEventListener("visibilitychange", arm);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", arm);
    };
  }, [ringing]);
  return ringing;
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
  const ctx = useCampaign();
  const can = useQuery(
    campaign.members,
    () => ctx.commands.permits(timerControl, { id: m.id, action: "stop" }) === true,
  );
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
          {done ? "Time’s up" : stopped ? `${clock(left)} stopped` : clock(left)}
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
            variant="ghost"
            onClick={() => ctx.execute(timerControl, { id: m.id, action: "restart" })}
          >
            Restart
          </Button>
          {!done &&
            (stopped ? (
              <Button
                variant="ghost"
                onClick={() => ctx.execute(timerControl, { id: m.id, action: "resume" })}
              >
                Resume
              </Button>
            ) : (
              <Button
                variant="ghost"
                onClick={() => ctx.execute(timerControl, { id: m.id, action: "stop" })}
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
  const ctx = useCampaign();
  const can = useQuery(
    campaign.members,
    () => ctx.commands.permits(setCounterValue, { id: m.id, value: 0 }) === true,
  );
  const set = (value: number) => ctx.execute(setCounterValue, { id: m.id, value });
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
            <Button variant="icon" label="Up one" disabled={full} onClick={() => set(value + 1)}>
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
  const pinnedIds = useQuery(campaign.messageState, () =>
    withField(campaign.messageState, "pinned").join(" "),
  );
  const messages = useQuery(campaign.chat.messages);
  const gm = useQuery(campaign.members, () => campaign.isGm());
  const me = useQuery(device).id;
  const ids = new Set(pinnedIds.split(" ").filter(Boolean));
  const pinned = messages.filter((m) => ids.has(m.id) && visibilityOf(m, me, gm) === "full");
  const shownIds = pinned.map((m) => m.id).join(" ");
  const shown = new Set(shownIds.split(" ").filter(Boolean));

  // Unpinned ones stay a moment to fold away.
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const before = useRef<Set<string>>(shown);
  useEffect(() => {
    const currentShown = new Set(shownIds.split(" ").filter(Boolean));
    const gone = [...before.current].filter((id) => !currentShown.has(id));
    const goneIds = new Set(gone);
    before.current = currentShown;
    if (!gone.length) return;
    setLeaving((current) => new Set([...current, ...gone]));
    const timeout = window.setTimeout(
      () => setLeaving((current) => new Set([...current].filter((id) => !goneIds.has(id)))),
      PIN_LEAVE_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [shownIds]);
  // Those here when the strip first drew came with it.
  const initial = useConstant(() => shown);

  const rows = messages.filter((m) => shown.has(m.id) || leaving.has(m.id));
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
            // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable so the GM can open its menu by keyboard
            tabIndex={gm && shown.has(m.id) ? 0 : undefined}
            aria-label={gm && shown.has(m.id) ? `Pinned message from ${m.name}` : undefined}
            {...(gm && shown.has(m.id) ? menuTrigger((x, y) => onMenu(x, y, m.id)) : {})}
          >
            <div className="chat-pin-body">{render(m)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
