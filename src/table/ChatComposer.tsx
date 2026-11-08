import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { COMMANDS, parseCommand, suggest } from "../features/chat/commands";
import { commandText, emptyChatContent, type ChatContent } from "../features/chat/content";
import { addToRoll, postRoll, runCommand } from "../features/chat/send";
import type { RollVisibility } from "../features/chat/types";
import { NotationError } from "../features/dice/notation";
import { pickName, poolFormula, samePick, signed, type TrayPick } from "../features/dice/pool";
import { selectedCharacterId, selectedStatBonuses } from "../features/characters/api";
import type { Campaign } from "../campaign/campaign";
import { useY } from "../ui/useY";
import { Button } from "../ui/Button";
import { trackPointer } from "../ui/pointer";
import { ChatInput, type ChatInputHandle } from "./ChatInput";
import { holdNewPick } from "./RollDie";

const VISIBILITIES: { id: RollVisibility; label: string; title: string }[] = [
  { id: "public", label: "Public", title: "Everyone sees the roll" },
  {
    id: "private",
    label: "Secret",
    title: "Only you and the GM see the result",
  },
];
const DICE: TrayPick[] = [4, 6, 8, 10, 12, 20].map((sides) => ({ kind: "die", sides }));
const TOKENS: TrayPick[] = [
  { kind: "modifier", value: 1 },
  { kind: "modifier", value: -1 },
];
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
  // The selected character's stats, as chips; read again as the character or the choice changes.
  useY(campaign.members, () => selectedCharacterId(campaign));
  const stats = JSON.parse(
    useY(campaign.characters, () =>
      JSON.stringify(
        selectedStatBonuses(campaign).map(({ stat, value }) => ({ kind: "stat", stat, value })),
      ),
    ),
  ) as TrayPick[];
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
  const [pool, setPool] = useState<TrayPick[]>([]);
  const poolTimer = useRef(0);
  const rollPoolRef = useRef<() => void>(() => {});

  function rollPool() {
    clearTimeout(poolTimer.current);
    const formula = poolFormula(pool);
    setPool([]);
    if (!formula) return;
    try {
      void postRoll(campaign, formula, visibility);
    } catch (e) {
      if (e instanceof NotationError) setError(e.message);
    }
  }
  // The pool's timer rolls whatever is in it by then.
  useLayoutEffect(() => {
    rollPoolRef.current = rollPool;
  });

  function setPoolAndTimer(next: TrayPick[]) {
    setPool(next);
    clearTimeout(poolTimer.current);
    if (next.length) poolTimer.current = window.setTimeout(() => rollPoolRef.current(), POOL_MS);
  }

  function addPick(pick: TrayPick) {
    setPoolAndTimer([...pool, pick]);
  }

  /** Right-click while pooling: take one of these picks back out. */
  function removePick(pick: TrayPick) {
    const i = pool.findLastIndex((picked) => samePick(picked, pick));
    if (i < 0) return;
    setPoolAndTimer(pool.filter((_, j) => j !== i));
  }
  /**
   * Dragging out of a die or token button carries off a new one: let go over
   * a roll this device may change, it joins that roll; a die let go anywhere
   * else but the tray is rolled on its own.
   */
  const dragged = useRef(false);
  function dragOut(event: React.PointerEvent<HTMLButtonElement>, pick: TrayPick) {
    if (event.button !== 0) return;
    dragged.current = false;
    const origin = { x: event.clientX, y: event.clientY };
    let held: ReturnType<typeof holdNewPick> | undefined;
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
          held = holdNewPick(pick);
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
        if (card?.dataset.diceTarget) addToRoll(campaign, card.dataset.diceTarget, pick);
        else if (
          pick.kind === "die" &&
          !document.elementFromPoint(end.clientX, end.clientY)?.closest(".dice-tray")
        )
          void postRoll(campaign, `d${pick.sides}`, visibility);
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

  function pickButton(pick: TrayPick) {
    const name = pickName(pick);
    const n = pool.filter((picked) => samePick(picked, pick)).length;
    return (
      <Button
        key={name}
        variant="secondary"
        className="dice-pick"
        data-count={n || undefined}
        label={
          n
            ? `Add another ${name} (${n} so far; right-click to remove one)`
            : `${pick.kind === "die" ? "Roll a" : "Add"} ${pick.kind === "stat" ? `${name} (${signed(pick.value)})` : name} (click again for more, or drag onto a roll to add it)`
        }
        onPointerDown={(event) => dragOut(event, pick)}
        onClick={() => {
          // The click that ends a drag out of the button isn't a pick.
          if (dragged.current) dragged.current = false;
          else addPick(pick);
        }}
        onContextMenu={(e) => {
          if (!pool.length) return;
          e.preventDefault();
          removePick(pick);
        }}
      >
        {name}
      </Button>
    );
  }

  return (
    <div className="dice-tray">
      <div className="dice-quick">
        <div className="tray-row">
          {DICE.map(pickButton)}
          {poolFormula(pool) ? (
            // Restarted on every change, so the fill shows time left before the roll.
            <Button
              key={pool.map(pickName).join()}
              variant="secondary"
              className="dice-roll-now"
              style={{ "--pool-ms": `${POOL_MS}ms` }}
              label={`Roll ${poolFormula(pool)} now`}
              onClick={rollPool}
            >
              <span className="dice-roll-formula">{poolFormula(pool).replace(/\b1d/g, "d")}</span>
            </Button>
          ) : (
            <Button
              variant="ghost"
              className="dice-visibility"
              label={vis.title}
              onClick={nextVisibility}
            >
              {vis.label}
            </Button>
          )}
        </div>
        <div className="tray-row tray-chips">
          {TOKENS.map(pickButton)}
          {stats.length > 0 && <span className="tray-divider" aria-hidden="true" />}
          {stats.map(pickButton)}
        </div>
      </div>
      <form
        className="dice-entry"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
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
        <ChatInput
          campaign={campaign}
          handleRef={input}
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
        <Button variant="primary" type="submit" label="Send" disabled={!typed.trim()}>
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
