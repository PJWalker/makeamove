import { memo, useEffect, useMemo, useState } from "react";
import { renderToReactElement } from "@tiptap/static-renderer/pm/react";
import { type ChatContent } from "../features/chat/content";
import type { ChatMessage, TextMessage } from "../features/chat/types";
import { canEdit, getCharacter, selectedCharacterId } from "../features/characters/api";
import { TRACKER_NODE, type TrackerButton } from "../features/characters/trackers";
import { TrackerButtonView } from "../workspace/FormattedText";
import { stampTime } from "../lib/hlc";
import type { Campaign } from "../campaign/campaign";
import { device } from "../platform/device";
import { useY } from "../ui/useY";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { menuTrigger } from "../ui/menuTrigger";
import { chatContentExtensions } from "./ChatInput";
import { LINK_NODE } from "../features/notes/links";
import type { LinkKind } from "../features/notes/links";
import { LinkChip } from "../workspace/LinkChip";
import {
  CounterCard,
  EditBox,
  editedText,
  editingMessage,
  isPinned,
  TimerCard,
  useTextState,
} from "./ChatExtras";
import { playUiSound } from "../ui/sounds";
import { MoveCard, RollCard } from "./RollCards";
import { useValue } from "../ui/useValue";

/* One message in the chat, as the log and the pinned strip show it. */

const time = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

/** One message on its own, as it shows in the log: for chat popping up outside the panel. */
export function LoneMessage({ campaign, m }: { campaign: Campaign; m: ChatMessage }) {
  const canAct = useY(campaign.characters, () => {
    const c = m.kind === "move" ? getCharacter(campaign, m.characterId) : undefined;
    return !!c && canEdit(campaign, c);
  });
  const me = useValue(device).id;
  return (
    <Message
      campaign={campaign}
      m={m}
      header
      fresh
      masked={false}
      mine={m.author === me}
      canAct={canAct}
    />
  );
}

type MessageProps = {
  campaign: Campaign;
  m: ChatMessage;
  header: boolean;
  fresh: boolean;
  masked: boolean;
  mine: boolean;
  /** For a move: whether its follow-up buttons may be used. */
  canAct: boolean;
  /** For a scene change: offer to join the GM on that scene. */
  canGo?: boolean;
  /** Opens the message's menu; present when there's something in it. */
  onMenu?: ((x: number, y: number, id: string) => void) | undefined;
};

/** Messages that have played their arrival, so scrolling the log's window back over them doesn't replay it. */
const arrived = new Set<string>();

/** Memoised: the log re-renders as messages arrive, but a message only when its own props change. */
export const Message = memo(function Message({
  campaign,
  m,
  header,
  fresh,
  masked,
  mine,
  canAct,
  canGo,
  onMenu,
}: MessageProps) {
  const menu = useMemo(() => onMenu && menuTrigger((x, y) => onMenu(x, y, m.id)), [onMenu, m.id]);
  // Fixed when it mounts, so a re-render mid-animation doesn't cut it short.
  const [arriving] = useState(() => fresh && !arrived.has(m.id));
  const [arrival] = useState({ fresh, id: m.id, mine, arriving });
  useEffect(() => {
    if (!arrival.fresh) return;
    arrived.add(arrival.id);
    if (arrival.arriving && !arrival.mine) playUiSound("message");
  }, [arrival]);
  const pinned = useY(campaign.messageState, () => isPinned(campaign, m.id));
  if (m.kind === "system") {
    const session = m.event === "session-start" || m.event === "session-end";
    return (
      <div
        className="chat-system"
        data-key={m.id}
        data-session={session}
        data-fresh={arriving}
        {...menu}
      >
        <span>{m.text}</span>
        {canGo && (
          <Button
            variant="ghost"
            className="chat-go"
            onClick={() => campaign.setActiveScene(m.sceneId!)}
          >
            Go There
          </Button>
        )}
      </div>
    );
  }
  const whisper = m.kind === "text" && m.to;
  return (
    <article
      className="chat-msg"
      data-key={m.id}
      data-header={header}
      data-whisper={!!whisper}
      data-fresh={arriving}
      data-pinned={pinned || undefined}
      {...menu}
    >
      {header && (
        <header className="chat-msg-head">
          <Avatar id={m.author} name={m.name} online />
          <span className="chat-author">{m.name}</span>
          <time className="chat-time" dateTime={new Date(stampTime(m.hlc)).toISOString()}>
            {time.format(stampTime(m.hlc))}
          </time>
        </header>
      )}
      {m.kind === "roll" ? (
        <RollCard campaign={campaign} m={m} masked={masked} arriving={arriving} mine={mine} />
      ) : m.kind === "move" ? (
        <MoveCard campaign={campaign} m={m} canAct={canAct} arriving={arriving} mine={mine} />
      ) : m.kind === "timer" ? (
        <TimerCard campaign={campaign} m={m} />
      ) : m.kind === "counter" ? (
        <CounterCard campaign={campaign} m={m} />
      ) : (
        <TextBody campaign={campaign} m={m} mine={mine} />
      )}
    </article>
  );
});

function TextBody({ campaign, m, mine }: { campaign: Campaign; m: TextMessage; mine: boolean }) {
  const state = useTextState(campaign, m.id);
  const text = editedText(state, m.text);
  const editing = useValue(editingMessage);
  if (editing === m.id) return <EditBox campaign={campaign} id={m.id} text={text} />;
  return (
    <div className="chat-text" data-emote={m.emote}>
      {m.to && (
        <span className="chat-whisper-tag">
          {mine ? `Whisper to ${m.toNames?.join(", ")}` : "Whispered to you"}
        </span>
      )}
      {m.emote && <span className="chat-emote-name">{m.name} </span>}
      <Rich campaign={campaign} content={text} />
      {typeof state.editedAt === "number" && state.editedAt > 0 && (
        <span className="chat-edited muted"> (edited)</span>
      )}
    </div>
  );
}

/** A pinned message in the strip above the log: timers and counters as they are, text with who said it. */
export function PinnedMessage({ campaign, m }: { campaign: Campaign; m: ChatMessage }) {
  if (m.kind === "timer") return <TimerCard campaign={campaign} m={m} compact />;
  if (m.kind === "counter") return <CounterCard campaign={campaign} m={m} compact />;
  if (m.kind === "text") return <PinnedText campaign={campaign} m={m} />;
  if (m.kind === "roll")
    return (
      <span>
        {m.name}: {m.comment ? `${m.comment} ` : ""}
        {m.roll.formula} = {m.roll.total}
      </span>
    );
  if (m.kind === "move")
    return (
      <span>
        {m.characterName}: {m.moveName}
      </span>
    );
  return null;
}

function PinnedText({ campaign, m }: { campaign: Campaign; m: TextMessage }) {
  const text = editedText(useTextState(campaign, m.id), m.text);
  return (
    <span className="chat-text">
      <strong>{m.name}</strong> <Rich campaign={campaign} content={text} />
    </span>
  );
}

function Rich({ campaign, content }: { campaign: Campaign; content: ChatContent }) {
  const rendered = renderToReactElement({
    extensions: chatContentExtensions(campaign),
    content,
    options: {
      nodeMapping: {
        [LINK_NODE]: ({ node }) => {
          const attrs = node.attrs as {
            kind: LinkKind;
            id: string;
            text?: string | null;
          };
          return (
            <LinkChip
              campaign={campaign}
              kind={attrs.kind}
              id={attrs.id}
              text={attrs.text ?? undefined}
            />
          );
        },
        [TRACKER_NODE]: ({ node }) => (
          <ChatTrackerButton campaign={campaign} b={node.attrs as TrackerButton} />
        ),
      },
    },
  });
  return rendered;
}

/** A button in a message changes the numbers of whichever character the viewer has selected. */
function ChatTrackerButton({ campaign, b }: { campaign: Campaign; b: TrackerButton }) {
  const characterId = useY(campaign.members, () => selectedCharacterId(campaign)) ?? null;
  return <TrackerButtonView campaign={campaign} characterId={characterId} b={b} />;
}
