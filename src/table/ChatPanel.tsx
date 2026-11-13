import { useCallback, useEffect, useRef, useState } from "react";
import { entityContent } from "../features/chat/content";
import type { Campaign } from "../campaign/campaign";
import { ContextMenu, type MenuItem } from "../ui/ContextMenu";
import { registerLinkDrop } from "../workspace/entityDrag";
import { PinnedStrip } from "./ChatExtras";
import { ChatComposer } from "./ChatComposer";
import { ChatLog } from "./ChatLog";
import { PinnedMessage } from "./ChatMessage";
import { useCampaign } from "../workspace/campaignContext";
import { useQuery } from "../ui/useQuery";
import { say } from "../workspace/commands/chat";
import { menuFor } from "../workspace/commands/views";

/*
 * The chat panel: who's here, the log of chat and rolls, the message box
 * (with slash commands), and the quick dice bar.
 */

export function ChatPanel({ campaign }: { campaign: Campaign }) {
  const ctx = useCampaign();
  /** Replies only this device sees: /help, and errors. */
  const notes = useQuery(ctx.table.chatNotes);
  const ref = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const openMenu = useCallback(
    (x: number, y: number, id: string) => {
      const items = menuFor(ctx, { kind: "chatMessage", id });
      if (items.length) setMenu({ x, y, items });
    },
    [ctx],
  );

  // Something dragged onto the chat is sent as a link (into the message box, it joins the message instead).
  useEffect(() => {
    if (!ref.current) return;
    return registerLinkDrop(ref.current, (link) => {
      ctx.execute(say, { content: entityContent(link.kind, link.id, link.label) });
    });
  }, [ctx]);

  return (
    <div className="chat" ref={ref}>
      <PinnedStrip
        campaign={campaign}
        render={(m) => <PinnedMessage campaign={campaign} m={m} />}
        onMenu={openMenu}
      />
      <ChatLog campaign={campaign} notes={notes} onMenu={openMenu} />
      <ChatComposer campaign={campaign} />
      {menu && <ContextMenu {...menu} onClose={closeMenu} />}
    </div>
  );
}
