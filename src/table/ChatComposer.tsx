import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { commandText, emptyChatContent } from "../features/chat/content";
import type { ChatContent } from "../features/chat/content";
import { useCampaign } from "../workspace/campaignContext";
import { chatCall, suggestSlash } from "../workspace/commands/chat";
import { invoke } from "../workspace/commands/views";
import type { RollVisibility } from "../features/chat/types";
import type { TrayPick } from "../features/dice/pool";
import { actingCharacterId, actingStatBonuses } from "../features/characters/api";
import type { Campaign } from "../campaign/campaign";
import { useQuery } from "../ui/useQuery";
import { Button } from "../ui/Button";
import { ChatInput } from "./ChatInput";
import type { ChatInputHandle } from "./ChatInput";
import { PendingRollCard } from "./RollCards";
import { QuickDice } from "./QuickDice";
import { useDicePool } from "./useDicePool";

/** The selected character's stats, as chips; read again as the character or the choice changes. */
function useStatChips(campaign: Campaign): TrayPick[] {
  useQuery(campaign.members, () => actingCharacterId(campaign));
  return JSON.parse(
    useQuery(campaign.characters, () =>
      JSON.stringify(
        actingStatBonuses(campaign).map(({ stat, value }) => ({ kind: "stat", stat, value })),
      ),
    ),
  ) as TrayPick[];
}

/** The message box and the command hints above it. */
function MessageBox({
  campaign,
  visibility,
  error,
  onError,
}: {
  campaign: Campaign;
  visibility: RollVisibility;
  error: string | null;
  onError: (message: string | null) => void;
}) {
  const context = useCampaign();
  const [content, setContent] = useState<ChatContent>(() => emptyChatContent());
  const typed = commandText(content);
  const last = useRef("");
  const input = useRef<ChatInputHandle | null>(null);
  // Which commands are offered follows the player's role.
  useQuery(campaign.members, () => campaign.isGm());
  const hints = suggestSlash(context, typed);

  function send() {
    const source = commandText(content);
    if (!source.trim()) return;
    // Quick dice and a bare formula use the toggle's visibility; /r and /sr their own.
    const call = chatCall(context, content, visibility);
    if ("error" in call) {
      onError(call.error);
      return;
    }
    invoke(context, call.command, call.params);
    last.current = source;
    input.current?.set("");
    onError(null);
  }

  return (
    <>
      <form
        className="dice-entry"
        data-tutorial="chat-message"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        {hints.length > 0 && (
          <ul className="chat-hints" aria-label="Commands">
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
          invalid={Boolean(error)}
          onChange={(next) => {
            setContent(next);
            onError(null);
          }}
          onEnter={send}
          onUp={() => last.current && input.current?.set(last.current)}
          onEscape={() => {
            input.current?.set("");
            onError(null);
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
    </>
  );
}

/** The message box, its command hints, and the quick dice bar above it. */
export function ChatComposer({
  campaign,
  onQuickRollMessage,
  rollOverlay,
}: {
  campaign: Campaign;
  onQuickRollMessage: (id: string | null) => void;
  rollOverlay: HTMLElement | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<RollVisibility>("public");
  const stats = useStatChips(campaign);
  const dice = useDicePool({ visibility, onQuickRollMessage, onError: setError });
  const { diceTray, pendingRollCard, pool, releasedRoll, pendingDieLanded, pendingDieEntered } =
    dice;

  return (
    <>
      <div className="dice-tray" ref={diceTray}>
        <QuickDice dice={dice} stats={stats} visibility={visibility} onVisibility={setVisibility} />
        <MessageBox campaign={campaign} visibility={visibility} error={error} onError={setError} />
      </div>
      {pool.length > 0 && rollOverlay
        ? createPortal(
            <PendingRollCard
              key="pending"
              cardRef={pendingRollCard}
              picks={pool}
              visibility={visibility}
              releasedRoll={releasedRoll}
              onDieLanded={pendingDieLanded}
              onDieEntered={pendingDieEntered}
            />,
            rollOverlay,
          )
        : null}
    </>
  );
}
