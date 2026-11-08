import { useCallback, useEffect, useRef, useState } from "react";
import { entityContent } from "../features/chat/content";
import { postText } from "../features/chat/send";
import { canDelete, canEditMessage } from "../features/chat/types";
import { clearState } from "../features/chat/messageState";
import type { Campaign } from "../campaign/campaign";
import { device } from "../platform/device";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { IconDelete, IconPin, IconRename } from "../ui/icons";
import { registerLinkDrop } from "./entityDrag";
import { editingMessage, isPinned, PinnedStrip, setPinned } from "./ChatExtras";
import { ChatComposer } from "./ChatComposer";
import { ChatLog } from "./ChatLog";
import { PinnedMessage } from "./ChatMessage";

/*
 * The chat panel: who's here, the log of chat and rolls, the message box
 * (with slash commands), and the quick dice bar.
 */

export function ChatPanel({ campaign }: { campaign: Campaign }) {
  /** Replies only this device sees: /help, and errors. */
  const [notes, setNotes] = useState<{ id: number; text: string; error?: boolean }[]>([]);
  const note = (text: string, error = false) =>
    setNotes([...notes, { id: Date.now(), text, error }]);
  const ref = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const openMenu = useCallback(
    (x: number, y: number, id: string) => {
      const m = campaign.chat.messages.value.find((message) => message.id === id);
      if (!m) return;
      const gm = campaign.isGm();
      const items: MenuItem[] = [];
      if (canEditMessage(m, device.value.id))
        items.push({
          label: "Edit Message",
          Icon: IconRename,
          onSelect: () => (editingMessage.value = id),
        });
      if (gm && m.kind !== "system") {
        const pinned = isPinned(campaign, id);
        items.push({
          label: pinned ? "Unpin message" : "Pin message",
          Icon: IconPin,
          onSelect: () => setPinned(campaign, id, !pinned),
        });
      }
      if (canDelete(m, device.value.id, gm)) {
        if (items.length) items.push("divider");
        items.push({
          label: "Delete Message",
          Icon: IconDelete,
          danger: true,
          onSelect: () => removeMessage(campaign, id),
        });
      }
      if (items.length) setMenu({ x, y, items });
    },
    [campaign],
  );

  // Something dragged onto the chat is sent as a link (into the message box, it joins the message instead).
  useEffect(() => {
    if (!ref.current) return;
    return registerLinkDrop(ref.current, (link) => {
      void postText(campaign, entityContent(link.kind, link.id, link.label));
    });
  }, [campaign]);

  return (
    <div className="chat" ref={ref}>
      <PinnedStrip
        campaign={campaign}
        render={(m) => <PinnedMessage campaign={campaign} m={m} />}
        onMenu={openMenu}
      />
      <ChatLog campaign={campaign} notes={notes} onMenu={openMenu} />
      <ChatComposer campaign={campaign} onNote={note} />
      {menu && <ContextMenu {...menu} onClose={closeMenu} />}
    </div>
  );
}

/** Delete a message and whatever was recorded about it. */
function removeMessage(campaign: Campaign, id: string) {
  campaign.doc.transact(() => {
    campaign.chat.remove(id);
    clearState(campaign.messageState, id);
  });
}
