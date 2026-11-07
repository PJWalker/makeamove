import { useSignal } from "@preact/signals-react";
import { useEffect, useRef } from "react";
import { COMMANDS, parseCommand, suggest } from "../features/chat/commands";
import { commandText, emptyChatContent, type ChatContent } from "../features/chat/content";
import { postRoll, runCommand } from "../features/chat/send";
import type { RollVisibility } from "../features/chat/types";
import { NotationError } from "../features/dice/notation";
import { poolFormula } from "../features/dice/pool";
import type { Campaign } from "../campaign/campaign";
import { useY } from "../ui/useY";
import { Button } from "../ui/Button";
import { ChatInput, type ChatInputHandle } from "./ChatInput";

const VISIBILITIES: { id: RollVisibility; label: string; title: string }[] = [
  { id: "public", label: "Public", title: "Everyone sees the roll" },
  {
    id: "private",
    label: "Secret",
    title: "Only you and the GM see the result",
  },
];
const DICE = [4, 6, 8, 10, 12, 20];
/** How long after the last quick-dice click the pool rolls. */
const POOL_MS = 1000;

/** The message box, its command hints, and the quick dice bar above it. */
export function ChatComposer({
  campaign,
  onNote,
}: {
  campaign: Campaign;
  onNote: (text: string, error?: boolean) => void;
}) {
  const content = useSignal<ChatContent>(emptyChatContent());
  const typed = commandText(content.value);
  const error = useSignal<string | null>(null);
  const visibility = useSignal<RollVisibility>("public");
  const last = useRef("");
  const input = useRef<ChatInputHandle | null>(null);
  const isGm = useY(campaign.members, () => campaign.isGm());
  const members = useY(campaign.members, () => campaign.memberViews());
  const hints = suggest(typed, isGm);

  function send() {
    const message = content.value;
    const source = commandText(message);
    if (!source.trim()) return;
    const cmd = parseCommand(source, members, isGm);
    if (cmd.kind === "error") {
      error.value = cmd.message;
      return;
    }
    if (cmd.kind === "help") {
      const lines = COMMANDS.filter((c) => isGm || !c.gmOnly).map((c) => `${c.usage}  ${c.help}`);
      onNote(
        ["Commands:", ...lines, "Formulas: 2d6+1, 4d6kh3, 2d20kl1, d6!, 1d8+2[STR]"].join("\n"),
      );
    } else {
      // A roll typed with /r or /sr uses its own visibility; quick dice and a bare formula use the toggle.
      const bare = cmd.kind === "roll" && !source.trim().startsWith("/");
      runCommand(campaign, bare ? { ...cmd, visibility: visibility.value } : cmd, message);
    }
    last.current = source;
    input.current?.set("");
    error.value = null;
  }

  // Quick dice gather into a pool, rolled together once the clicks stop:
  // clicking the d20 twice rolls 2d20 as one entry.
  const pool = useSignal<number[]>([]);
  const poolTimer = useRef(0);
  const rollPoolRef = useRef<() => void>(() => {});

  function rollPool() {
    clearTimeout(poolTimer.current);
    const picked = pool.value;
    pool.value = [];
    if (!picked.length) return;
    try {
      postRoll(campaign, poolFormula(picked), visibility.value);
    } catch (e) {
      if (e instanceof NotationError) error.value = e.message;
    }
  }
  rollPoolRef.current = rollPool;

  function restartPoolTimer() {
    clearTimeout(poolTimer.current);
    if (pool.value.length)
      poolTimer.current = window.setTimeout(() => rollPoolRef.current(), POOL_MS);
  }

  function addDie(sides: number) {
    pool.value = [...pool.value, sides];
    restartPoolTimer();
  }

  /** Right-click while pooling: take one of these dice back out. */
  function removeDie(sides: number) {
    const i = pool.value.lastIndexOf(sides);
    if (i < 0) return;
    pool.value = pool.value.filter((_, j) => j !== i);
    restartPoolTimer();
  }
  // Dice picked just before the panel closes still get rolled.
  useEffect(() => () => rollPoolRef.current(), []);

  const nextVisibility = () => {
    const options = VISIBILITIES.map((v) => v.id);
    visibility.value = options[(options.indexOf(visibility.value) + 1) % options.length]!;
  };
  const vis = VISIBILITIES.find((v) => v.id === visibility.value) ?? VISIBILITIES[0]!;

  return (
    <div className="dice-tray">
      <div className="dice-quick">
        {DICE.map((sides) => {
          const n = pool.value.filter((p) => p === sides).length;
          return (
            <Button
              key={sides}
              variant="ghost"
              size="sm"
              className="dice-pick"
              data-count={n || undefined}
              label={
                n
                  ? `Add another d${sides} (${n} so far; right-click to remove one)`
                  : `Roll a d${sides} (click again for more)`
              }
              onClick={() => addDie(sides)}
              onContextMenu={(e) => {
                if (!pool.value.length) return;
                e.preventDefault();
                removeDie(sides);
              }}
            >
              d{sides}
            </Button>
          );
        })}
        {pool.value.length ? (
          // Restarted on every change, so the fill shows time left before the roll.
          <Button
            key={pool.value.join()}
            variant="secondary"
            size="sm"
            className="dice-roll-now"
            style={{ "--pool-ms": `${POOL_MS}ms` }}
            label={`Roll ${poolFormula(pool.value)} now`}
            onClick={rollPool}
          >
            {poolFormula(pool.value).replace(/\b1d/g, "d")}
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="dice-visibility"
            label={vis.title}
            onClick={nextVisibility}
          >
            {vis.label}
          </Button>
        )}
      </div>
      {hints.length > 0 && (
        <ul className="chat-hints" role="listbox" aria-label="Commands">
          {hints.map((h) => (
            <li key={h.names[0]}>
              <button
                type="button"
                className="chat-hint"
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
        className="dice-entry"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <ChatInput
          campaign={campaign}
          handle={input}
          placeholder="Message, @ to link, or roll 2d6+1"
          label="Message"
          invalid={!!error.value}
          onChange={(next) => {
            content.value = next;
            error.value = null;
          }}
          onEnter={send}
          onUp={() => last.current && input.current?.set(last.current)}
          onEscape={() => {
            input.current?.set("");
            error.value = null;
          }}
        />
        <Button variant="primary" size="sm" type="submit" label="Send" disabled={!typed.trim()}>
          Send
        </Button>
      </form>
      {error.value && (
        <p className="chat-error" role="alert">
          {error.value}
        </p>
      )}
    </div>
  );
}
