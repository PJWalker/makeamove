import { useEffect, useRef, useState } from "react";
import { COMMANDS, parseCommand, suggest } from "../features/chat/commands";
import { commandText, emptyChatContent, type ChatContent } from "../features/chat/content";
import { addDieToRoll, postRoll, runCommand } from "../features/chat/send";
import type { RollVisibility } from "../features/chat/types";
import { NotationError } from "../features/dice/notation";
import { poolFormula } from "../features/dice/pool";
import type { Campaign } from "../campaign/campaign";
import { useY } from "../ui/useY";
import { Button } from "../ui/Button";
import { trackPointer } from "../ui/pointer";
import { ChatInput, type ChatInputHandle } from "./ChatInput";
import { holdNewDie } from "./RollDie";

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
/** How far (CSS px) the pointer moves from a die button before it carries a die off. */
const DRAG_START = 6;

/** The roll a die let go of at this point joins, if any. */
const rollAt = (x: number, y: number) =>
  document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-dice-target]") ?? null;

/** The message box, its command hints, and the quick dice bar above it. */
export function ChatComposer({
  campaign,
  onNote,
}: {
  campaign: Campaign;
  onNote: (text: string, error?: boolean) => void;
}) {
  const [content, setContent] = useState<ChatContent>(emptyChatContent());
  const typed = commandText(content);
  const [error, setError] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<RollVisibility>("public");
  const last = useRef("");
  const input = useRef<ChatInputHandle | null>(null);
  const isGm = useY(campaign.members, () => campaign.isGm());
  const members = useY(campaign.members, () => campaign.memberViews());
  const hints = suggest(typed, isGm);

  function send() {
    const message = content;
    const source = commandText(message);
    if (!source.trim()) return;
    const cmd = parseCommand(source, members, isGm);
    if (cmd.kind === "error") {
      setError(cmd.message);
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
      runCommand(campaign, bare ? { ...cmd, visibility: visibility } : cmd, message);
    }
    last.current = source;
    input.current?.set("");
    setError(null);
  }

  // Quick dice gather into a pool, rolled together once the clicks stop:
  // clicking the d20 twice rolls 2d20 as one entry.
  const [pool, setPool] = useState<number[]>([]);
  const poolTimer = useRef(0);
  const rollPoolRef = useRef<() => void>(() => {});

  function rollPool() {
    clearTimeout(poolTimer.current);
    const picked = pool;
    setPool([]);
    if (!picked.length) return;
    try {
      postRoll(campaign, poolFormula(picked), visibility);
    } catch (e) {
      if (e instanceof NotationError) setError(e.message);
    }
  }
  rollPoolRef.current = rollPool;

  function setPoolAndTimer(next: number[]) {
    setPool(next);
    clearTimeout(poolTimer.current);
    if (next.length) poolTimer.current = window.setTimeout(() => rollPoolRef.current(), POOL_MS);
  }

  function addDie(sides: number) {
    setPoolAndTimer([...pool, sides]);
  }

  /** Right-click while pooling: take one of these dice back out. */
  function removeDie(sides: number) {
    const i = pool.lastIndexOf(sides);
    if (i < 0) return;
    setPoolAndTimer(pool.filter((_, j) => j !== i));
  }
  /**
   * Dragging out of a die button carries off a new die: let go over a roll
   * this device may change, it joins that roll; anywhere else but the tray,
   * it's rolled on its own.
   */
  const dragged = useRef(false);
  function dragOut(event: React.PointerEvent<HTMLButtonElement>, sides: number) {
    if (event.button !== 0) return;
    dragged.current = false;
    const origin = { x: event.clientX, y: event.clientY };
    let held: ReturnType<typeof holdNewDie> | undefined;
    let target: HTMLElement | null = null;
    const aim = (card: HTMLElement | null) => {
      if (card === target) return;
      target?.removeAttribute("data-drop-target");
      card?.setAttribute("data-drop-target", "");
      target = card;
    };
    trackPointer(
      "grabbing",
      (move) => {
        if (!held) {
          if (Math.hypot(move.clientX - origin.x, move.clientY - origin.y) < DRAG_START) return;
          held = holdNewDie(sides);
          dragged.current = true;
        }
        held.move(move.clientX, move.clientY);
        aim(rollAt(move.clientX, move.clientY));
      },
      (end) => {
        if (!held) return;
        held.remove();
        const card = target;
        aim(null);
        if (!(end instanceof PointerEvent) || end.type !== "pointerup") return;
        if (card?.dataset.diceTarget) addDieToRoll(campaign, card.dataset.diceTarget, sides);
        else if (!document.elementFromPoint(end.clientX, end.clientY)?.closest(".dice-tray"))
          void postRoll(campaign, `d${sides}`, visibility);
      },
    );
  }

  // Dice picked just before the panel closes still get rolled.
  useEffect(() => () => rollPoolRef.current(), []);

  const nextVisibility = () => {
    const options = VISIBILITIES.map((v) => v.id);
    setVisibility(options[(options.indexOf(visibility) + 1) % options.length]!);
  };
  const vis = VISIBILITIES.find((v) => v.id === visibility) ?? VISIBILITIES[0]!;

  return (
    <div className="dice-tray">
      <div className="dice-quick">
        {DICE.map((sides) => {
          const n = pool.filter((p) => p === sides).length;
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
                  : `Roll a d${sides} (click again for more, or drag onto a roll to add it)`
              }
              onPointerDown={(event) => dragOut(event, sides)}
              onClick={() => {
                // The click that ends a drag out of the button isn't a pick.
                if (dragged.current) dragged.current = false;
                else addDie(sides);
              }}
              onContextMenu={(e) => {
                if (!pool.length) return;
                e.preventDefault();
                removeDie(sides);
              }}
            >
              d{sides}
            </Button>
          );
        })}
        {pool.length ? (
          // Restarted on every change, so the fill shows time left before the roll.
          <Button
            key={pool.join()}
            variant="secondary"
            size="sm"
            className="dice-roll-now"
            style={{ "--pool-ms": `${POOL_MS}ms` }}
            label={`Roll ${poolFormula(pool)} now`}
            onClick={rollPool}
          >
            {poolFormula(pool).replace(/\b1d/g, "d")}
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
          invalid={!!error}
          onChange={(next) => {
            setContent(next);
            setError(null);
          }}
          onEnter={send}
          onUp={() => last.current && input.current?.set(last.current)}
          onEscape={() => {
            input.current?.set("");
            setError(null);
          }}
        />
        <Button variant="primary" size="sm" type="submit" label="Send" disabled={!typed.trim()}>
          Send
        </Button>
      </form>
      {error && (
        <p className="chat-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
