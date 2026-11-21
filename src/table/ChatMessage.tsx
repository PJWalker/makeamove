import { memo, useEffect, useMemo } from "react";
import { useConstant } from "../ui/useConstant";
import { renderToReactElement } from "@tiptap/static-renderer/pm/react";
import type { ChatContent } from "../features/chat/content";
import type { ChatMessage, TextMessage } from "../features/chat/types";
import { canEdit, getCharacter, actingCharacterId } from "../features/characters/api";
import { TRACKER_NODE, type TrackerButton } from "../data/richText";
import { TrackerButtonView } from "../workspace/RichTextView";
import { stampTime } from "../lib/hlc";
import type { Campaign } from "../campaign/campaign";
import { device } from "../platform/device";
import { useQuery } from "../ui/useQuery";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { menuTrigger } from "../ui/menuTrigger";
import { chatContentExtensions } from "./chatContentExtensions";
import { LINK_NODE } from "../features/notes/links";
import type { LinkKind } from "../features/notes/links";
import { LinkChip } from "../workspace/LinkChip";
import { editedText, useTextState } from "../features/chat/messageState";
import { CounterCard, EditBox, TimerCard } from "./ChatExtras";
import { isPinned } from "../features/chat/messages";
import { playUiSound } from "../ui/sounds";
import { MoveCard, RollCard } from "./RollCards";
import { useCampaign } from "../workspace/campaignContext";

/* One message in the chat, as the log and the pinned strip show it. */

const time = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

/** One message on its own, as it shows in the log: for chat popping up outside the panel. */
export function LoneMessage({ campaign, m }: { campaign: Campaign; m: ChatMessage }) {
  const canAct = useQuery(campaign.characters, () => {
    const c = m.kind === "move" ? getCharacter(campaign, m.characterId) : undefined;
    return !!c && canEdit(campaign, c);
  });
  const me = useQuery(device).id;
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

type MessageProperties = {
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
  /** This roll is the destination of the pending quick-roll card transition. */
  quickRoll?: boolean;
  quickRollActive?: boolean;
  /** Opens the message's menu; present when there's something in it. */
  onMenu?: ((x: number, y: number, id: string) => void) | undefined;
};

/** Messages that have played their arrival, so scrolling the log's window back over them doesn't replay it. */
const arrived = new Set<string>();

/**
 * Whether a message is playing its arrival. Fixed when it mounts, so a re-render
 * mid-animation doesn't cut it short; it plays its sound once, for others' messages.
 */
function useArrival(id: string, fresh: boolean, mine: boolean, quickRoll: boolean) {
  const arriving = useConstant(() => fresh && !arrived.has(id) && !quickRoll);
  const arrival = useConstant(() => ({ fresh, id, mine, arriving }));
  useEffect(() => {
    if (!arrival.fresh) return;
    arrived.add(arrival.id);
    if (arrival.arriving && !arrival.mine) playUiSound("message");
  }, [arrival]);
  return arriving;
}

/** What a message says, in the card for its kind. */
function MessageBody({
  m,
  ...properties
}: Pick<
  MessageProperties,
  "campaign" | "masked" | "mine" | "canAct" | "quickRoll" | "quickRollActive"
> & {
  m: Exclude<ChatMessage, { kind: "system" }>;
  arriving: boolean;
}) {
  const { campaign, mine, arriving } = properties;
  switch (m.kind) {
    case "roll": {
      return (
        <RollCard
          campaign={campaign}
          m={m}
          masked={properties.masked}
          arriving={arriving}
          mine={mine}
          quickRoll={properties.quickRoll ?? false}
          quickRollActive={properties.quickRollActive ?? false}
        />
      );
    }
    case "move": {
      return (
        <MoveCard campaign={campaign} m={m} canAct={properties.canAct} arriving={arriving} mine={mine} />
      );
    }
    case "timer": {
      return <TimerCard campaign={campaign} m={m} />;
    }
    case "counter": {
      return <CounterCard campaign={campaign} m={m} />;
    }
    case "text": {
      return <TextBody campaign={campaign} m={m} mine={mine} />;
    }
  }
}

/** A line of the log that isn't a person speaking: a session starting, or the scene changing. */
function SystemNotice({
  campaign,
  m,
  canGo,
  arriving,
  menu,
}: {
  campaign: Campaign;
  m: Extract<ChatMessage, { kind: "system" }>;
  canGo: boolean;
  arriving: boolean;
  menu: ReturnType<typeof menuTrigger> | undefined;
}) {
  return (
    <div
      className="chat-system"
      data-key={m.id}
      data-session={m.event === "session-start" || m.event === "session-end"}
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

/** Memoised: the log re-renders as messages arrive, but a message only when its own props change. */
export const Message = memo(function Message({
  m,
  header,
  fresh,
  canGo = false,
  quickRoll = false,
  onMenu,
  ...properties
}: MessageProperties) {
  const { campaign, mine } = properties;
  const menu = useMemo(() => onMenu && menuTrigger((x, y) => onMenu(x, y, m.id)), [onMenu, m.id]);
  const arriving = useArrival(m.id, fresh, mine, quickRoll);
  const pinned = useQuery(campaign.messageState, () => isPinned(campaign, m.id));
  if (m.kind === "system")
    return <SystemNotice campaign={campaign} m={m} canGo={canGo} arriving={arriving} menu={menu} />;
  return (
    <article
      className="chat-msg"
      data-key={m.id}
      data-header={header}
      data-whisper={m.kind === "text" && !!m.to}
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
      <MessageBody m={m} arriving={arriving} quickRoll={quickRoll} {...properties} />
    </article>
  );
});

function TextBody({ campaign, m, mine }: { campaign: Campaign; m: TextMessage; mine: boolean }) {
  const context = useCampaign();
  const state = useTextState(campaign, m.id);
  const text = editedText(state, m.text);
  const editing = useQuery(context.table.editingMessage);
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
      {typeof state["editedAt"] === "number" && state["editedAt"] > 0 && (
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
  const context = useCampaign();
  const rendered = renderToReactElement({
    extensions: chatContentExtensions(context),
    content,
    options: {
      nodeMapping: {
        [LINK_NODE]: ({ node }) => {
          const attributes = node.attrs as {
            kind: LinkKind;
            id: string;
            text?: string | null;
          };
          return (
            <LinkChip
              campaign={campaign}
              kind={attributes.kind}
              id={attributes.id}
              text={attributes.text ?? undefined}
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
  const characterId = useQuery(campaign.members, () => actingCharacterId(campaign)) ?? null;
  return <TrackerButtonView campaign={campaign} characterId={characterId} b={b} />;
}
