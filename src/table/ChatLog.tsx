import { useEffect, useMemo } from "react";
import { useConstant } from "../ui/useConstant";
import { canDelete, canEditMessage, postedSince, visibilityOf } from "../features/chat/types";
import { logRows  } from "../features/chat/sessions";
import type {LogRow} from "../features/chat/sessions";
import { markRead } from "../features/chat/unread";
import { toggleSetValue } from "../lib/set";
import { canEdit, getCharacter } from "../features/characters/api";
import type { Campaign } from "../campaign/campaign";
import { device } from "../platform/device";
import { useQuery } from "../ui/useQuery";
import { IconDice, IconExpand } from "../ui/icons";
import { usePanelVisible } from "../workspace/panelLayout";
import { useCampaign } from "../workspace/campaignContext";
import { Message } from "./ChatMessage";
import { wasTrayRolled } from "./quickRolls";
import { useLogWindow } from "./useLogWindow";

/* The chat log: every message and roll, rendered a window at a time. */

/** The ids of the characters this device may change, as one string (so it compares by value). */
const editableIds = (campaign: Campaign) =>
  [...campaign.characters.keys()]
    .filter((id) => {
      const c = getCharacter(campaign, id);
      return !!c && canEdit(campaign, c);
    })
    .join(" ");

export function ChatLog({
  campaign,
  notes,
  onMenu,
  quickRollMessage,
}: {
  campaign: Campaign;
  notes: { id: number; text: string; error?: boolean }[];
  onMenu: (x: number, y: number, id: string) => void;
  quickRollMessage: string | null;
}) {
  const context = useCampaign();
  const messages = useQuery(campaign.chat.messages);
  const isGm = useQuery(campaign.members, () => campaign.isGm());
  const here = useQuery(campaign.members, () => campaign.activeSceneId());
  const sceneIds = useQuery(campaign.scenes, () => [...campaign.scenes.keys()].join(','));
  // One subscription for every move card's follow-up buttons, rather than one per card.
  const editable = useQuery(campaign.characters, () => editableIds(campaign));
  const me = useQuery(device).id;
  // Only messages posted after the panel opened animate in; not ones already here, or older ones loaded later.
  const openedAt = useConstant(() => messages.at(-1)?.hlc ?? "");
  useMarkRead(campaign, messages);

  const opened = useQuery(context.table.openSessions);
  const rows = useMemo(
    () =>
      logRows(
        messages.filter((m) => visibilityOf(m, me, isGm) !== "hidden"),
        (key) => opened.has(key),
      ),
    [messages, me, isGm, opened],
  );
  const { ref, list, shown, above, below, atNewest, onScroll } = useLogWindow({
    campaign,
    rows,
    newest: messages.at(-1),
    me,
    settleOn: { editable, notes },
  });
  const viewer = {
    me,
    isGm,
    here,
    editableCharacters: new Set(editable.split(" ")),
    sceneIds: new Set(sceneIds),
  };

  return (
    <div
      ref={ref}
      className="panel-scroll chat-log"
      role="log"
      aria-live="polite"
      onScroll={onScroll}
    >
      {rows.length === 0 && notes.length === 0 && (
        <div className="empty">
          <IconDice size={28} />
          Say hello, or roll some dice.
        </div>
      )}
      <div className="chat-space" style={{ height: `${Math.round(above)}px` }} aria-hidden="true" />
      <div ref={list} className="chat-rows">
        {shown.map((row) => (
          <ChatRow
            key={row.key}
            campaign={campaign}
            row={row}
            viewer={viewer}
            fresh={row.kind === "message" && postedSince(row.m, openedAt)}
            quickRollMessage={quickRollMessage}
            onMenu={onMenu}
          />
        ))}
      </div>
      <div className="chat-space" style={{ height: `${Math.round(below)}px` }} aria-hidden="true" />
      {atNewest &&
        notes.map((n) => (
          <p key={n.id} className="chat-note" data-error={n.error}>
            {n.text}
          </p>
        ))}
    </div>
  );
}

/** In view means read: when the panel is showing and the window has focus, and again on regaining focus. */
function useMarkRead(campaign: Campaign, messages: readonly unknown[]) {
  const context = useCampaign();
  const visible = usePanelVisible(context.panels, "chat");
  useEffect(() => {
    if (visible && document.hasFocus()) markRead(campaign);
  }, [campaign, messages, visible]);
  useEffect(() => {
    const read = () => { markRead(campaign); };
    window.addEventListener("focus", read);
    return () => { window.removeEventListener("focus", read); };
  }, [campaign]);
}

/** Who is looking at the log, and what they may reach from it. */
interface Viewer {
  me: string;
  isGm: boolean;
  here: string | null | undefined;
  editableCharacters: Set<string>;
  sceneIds: Set<string>;
}

/** A row of the log: a folded session's heading, or a message. */
function ChatRow({
  campaign,
  row,
  viewer,
  fresh,
  quickRollMessage,
  onMenu,
}: {
  campaign: Campaign;
  row: LogRow;
  viewer: Viewer;
  fresh: boolean;
  quickRollMessage: string | null;
  onMenu: (x: number, y: number, id: string) => void;
}) {
  const context = useCampaign();
  const { me, isGm } = viewer;
  if (row.kind === "fold")
    return (
      <button
        data-key={row.key}
        type="button"
        className="chat-session-fold"
        aria-expanded={row.open}
        onClick={() => { context.table.openSessions.set(toggleSetValue(context.table.openSessions.value, row.part)); }
        }
      >
        <IconExpand size={22} className="chat-session-chevron" />
        <span className="chat-session-title">{row.title}</span>
        <span className="chat-session-count">
          {row.count} {row.count === 1 ? "message" : "messages"}
        </span>
      </button>
    );
  const { m } = row;
  const hasMenu = canDelete(m, me, isGm) || canEditMessage(m, me) || (isGm && m.kind !== "system");
  return (
    <Message
      campaign={campaign}
      m={m}
      header={row.header}
      fresh={fresh}
      masked={visibilityOf(m, me, isGm) === "masked"}
      mine={m.author === me}
      canAct={m.kind === "move" && viewer.editableCharacters.has(m.characterId)}
      canGo={
        m.kind === "system" &&
        m.event === "scene-change" &&
        !!m.sceneId &&
        m.sceneId !== viewer.here &&
        viewer.sceneIds.has(m.sceneId)
      }
      quickRoll={m.id === quickRollMessage || wasTrayRolled(m.id)}
      quickRollActive={m.id === quickRollMessage}
      onMenu={hasMenu ? onMenu : undefined}
    />
  );
}
