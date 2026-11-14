import { useState } from "react";
import type { LinkKind } from "../features/notes/links";
import { linkLabel, linkTip } from "../features/notes/targets";
import type { Campaign } from "../campaign/campaign";
import { menuTrigger } from "../ui/menuTrigger";
import { ContextMenu, type MenuItem } from "../ui/ContextMenu";
import { dragEntity } from "./entityDrag";
import { entity } from "./dragEntities";
import { linkMenuSections } from "./linkActions";
import { joinSections } from "./commands/views";
import { useCampaign } from "./campaignContext";

/**
 * A link outside the editors (in a chat message): it looks and behaves like
 * one in a note. Its tooltip says what it is; a click opens its pop-up; it
 * can be dragged onto a character, the hotbar or into text.
 */
export function LinkChip({
  campaign,
  kind,
  id,
  text,
}: {
  campaign: Campaign;
  kind: LinkKind;
  id: string;
  text?: string | undefined;
}) {
  const name = linkLabel(campaign, kind, id);
  if (name === null)
    return (
      <span className="note-link" data-missing="true" data-tip="Not available">
        {text || "Unavailable"}
      </span>
    );
  return <LiveLinkChip campaign={campaign} kind={kind} id={id} shown={text || name} />;
}

function LiveLinkChip({
  campaign,
  kind,
  id,
  shown,
}: {
  campaign: Campaign;
  kind: LinkKind;
  id: string;
  shown: string;
}) {
  const ctx = useCampaign();
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [button, setButton] = useState<HTMLButtonElement | null>(null);
  // The menu is built as it opens, from where the chip is then.
  const trigger = menuTrigger((x, y) =>
    setMenu({
      x,
      y,
      items: joinSections(
        linkMenuSections(
          ctx,
          { kind, id },
          { title: shown, openInWindow: () => button && ctx.linkPopups.show({ kind, id }, button) },
        ),
      ),
    }),
  );
  return (
    <>
      <button
        ref={setButton}
        type="button"
        className="note-link"
        data-kind={kind}
        data-tip={linkTip(campaign, kind, id) ?? undefined}
        data-tip-long="true"
        data-tip-opens="true"
        onClick={(e) => ctx.linkPopups.show({ kind, id }, e.currentTarget)}
        onPointerDown={(e) => {
          trigger.onPointerDown(e);
          dragEntity(ctx.canvas, e, entity(ctx, kind, id, shown));
        }}
        onContextMenu={(e) => trigger.onContextMenu(e)}
      >
        {shown}
      </button>
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
    </>
  );
}
