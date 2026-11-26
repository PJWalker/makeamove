import { useCallback, useEffect, useRef, useState } from "react";
import useConstant from "../ui/useConstant";
import { entityContent } from "../features/chat/content";
import type { Campaign } from "../campaign/campaign";
import { ContextMenu  } from "../ui/ContextMenu";
import type {MenuItem} from "../ui/ContextMenu";
import { registerLinkDrop } from "../workspace/entityDrag";
import { useCampaign } from "../workspace/campaignContext";
import { useQuery } from "../ui/useQuery";
import { say } from "../workspace/commands/chat";
import { menuFor } from "../workspace/commands/views";
import { PinnedStrip } from "./ChatExtras";
import ChatComposer from "./ChatComposer";
import ChatLog from "./ChatLog";
import { PinnedMessage } from "./ChatMessage";

/*
 * The chat panel: who's here, the log of chat and rolls, the message box
 * (with slash commands), and the quick dice bar.
 */

function ChatPanel({ campaign }: { campaign: Campaign }) {
  const context = useCampaign();
  /** Replies only this device sees: /help, and errors. */
  const notes = useQuery(context.table.chatNotes);
  const reference = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [quickRollMessage, setQuickRollMessage] = useState<string | null>(null);
  const rollOverlay = useConstant(() => {
    const host = document.createElement("div");
    host.className = "chat-roll-overlay-host";
    return host;
  });
  const closeMenu = useCallback(() => { setMenu(null); }, []);
  const openMenu = useCallback(
    (x: number, y: number, id: string) => {
      const items = menuFor(context, { kind: "chatMessage", id });
      if (items.length > 0) setMenu({ x, y, items });
    },
    [context],
  );

  // Something dragged onto the chat is sent as a link (into the message box, it joins the message instead).
  useEffect(() => {
    if (!reference.current) return;
    return registerLinkDrop(reference.current, (link) => {
      context.execute(say, { content: entityContent(link.kind, link.id, link.label) });
    });
  }, [context]);
  useEffect(() => {
    document.body.append(rollOverlay);
    return () => { rollOverlay.remove(); };
  }, [rollOverlay]);

  return (
    <div className="chat" ref={reference}>
      <PinnedStrip
        campaign={campaign}
        render={(m) => <PinnedMessage campaign={campaign} m={m} />}
        onMenu={openMenu}
      />
      <ChatLog
        campaign={campaign}
        notes={notes}
        onMenu={openMenu}
        quickRollMessage={quickRollMessage}
      />
      <ChatComposer
        campaign={campaign}
        onQuickRollMessage={setQuickRollMessage}
        rollOverlay={rollOverlay}
      />
      {menu && <ContextMenu {...menu} onClose={closeMenu} />}
    </div>
  );
}

export default ChatPanel;
