import { plainText } from "../data/richText";
import { MoveBody } from "../workspace/MoveBody";
import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useState } from "react";
import { canEdit, getCharacter, actingCharacterId, systemOf } from "../features/characters/api";
import { getNote } from "../features/notes/api";
import { linkLabel } from "../features/notes/targets";
import type { Campaign } from "../campaign/campaign";
import { useQuery } from "../ui/useQuery";
import { Button } from "../ui/Button";
import { closePopup } from "../ui/popup";
import { usePopupDialog } from "../workspace/usePopupDialog";
import { Dialog } from "../workspace/Dialog";
import { ContextMenu, type MenuItem } from "../ui/ContextMenu";
import { EntryWindow, rollTag } from "../workspace/EntryWindow";
import { linkActionItems, linkKey, type LinkRef } from "../workspace/linkState";
import { NoteEditor } from "./NoteEditor";
import { CharacterSheet } from "./sheets";
import { linkProxy } from "../workspace/LinkChip";
import { makeVerb } from "../workspace/sheetParts";
import { actionMenuItems } from "../workspace/actionMenu";
import { entityTabId } from "../workspace/entityWindowState";
import type { LinkPopups as LinkPopupState } from "../workspace/linkState";
import { useCampaign } from "../workspace/campaignContext";
import { giveItem, startMove } from "../workspace/commands/characters";

/*
 * What links in rich text open: a pop-up for each link clicked (gear and
 * moves with their rules, a character's sheet, a scene, a note's page),
 * the links' right-click menu, and renaming a link.
 */

export function LinkPopups({ campaign }: { campaign: Campaign }) {
  const ctx = useCampaign();
  useEffect(() => {
    const ids = [
      ...ctx.panels.layout.value.left.panels,
      ...ctx.panels.layout.value.right.panels,
      ...ctx.panels.layout.value.floating.map((w) => w.id),
    ];
    const restored = ids.flatMap((id) => {
      if (!id.startsWith("entity:link:")) return [];
      const key = id.slice("entity:link:".length);
      const split = key.indexOf(":");
      if (split < 0) return [];
      const kind = key.slice(0, split) as LinkRef["kind"];
      if (!["character", "item", "move", "note", "scene"].includes(kind)) return [];
      const link = { kind, id: key.slice(split + 1) };
      if (linkLabel(campaign, link.kind, link.id) === null) {
        ctx.windows.close(entityTabId(`link:${linkKey(link)}`));
        return [];
      }
      return [link];
    });
    const known = new Set(ctx.linkPopups.openLinks.value.map(linkKey));
    ctx.linkPopups.openLinks.set([
      ...ctx.linkPopups.openLinks.value,
      ...restored.filter((link) => !known.has(linkKey(link))),
    ]);
  }, [ctx, campaign]);
  const links = useQuery(ctx.linkPopups.openLinks);
  const menu = useQuery(ctx.linkPopups.linkMenu);
  return (
    <>
      {links.map((l) => (
        <LinkPopup key={linkKey(l)} campaign={campaign} link={l} />
      ))}
      {menu && <ContextMenu {...menu} onClose={() => ctx.linkPopups.linkMenu.set(null)} />}
      <RenameLink />
    </>
  );
}

/** A pop-up for one link, marked so clicking the link again brings it forward. */
function LinkDialog({
  campaign,
  link,
  title,
  children,
  menuItems,
}: {
  campaign: Campaign;
  link: LinkRef;
  title: string;
  children: ReactNode;
  menuItems?: MenuItem[];
}) {
  const ctx = useCampaign();
  const id = entityTabId(`link:${linkKey(link)}`);
  useLayoutEffect(() => {
    const proxy = linkProxy(ctx, link.kind, link.id, title);
    ctx.windows.register({
      id,
      title,
      graphicRef: { kind: proxy.kind, id: proxy.id },
      graphicDefaultIcon: proxy.defaultIcon,
      proxy,
      menuItems,
      content: children,
      close: () => ctx.linkPopups.close(link),
    });
  }, [ctx, campaign, id, link, title, children, menuItems]);
  return null;
}

function LinkPopup({ campaign, link }: { campaign: Campaign; link: LinkRef }) {
  const ctx = useCampaign();
  const system = systemOf(campaign);
  const close = () => ctx.linkPopups.close(link);
  const entryKey = `link:${linkKey(link)}`;
  // Gear and moves go to the character this device is playing, if they can change it.
  const me = useQuery(campaign.characters, () =>
    getCharacter(campaign, actingCharacterId(campaign)),
  );
  const canAct = !!me && canEdit(campaign, me);
  const character = useQuery(campaign.characters, () =>
    link.kind === "character" ? getCharacter(campaign, link.id) : undefined,
  );
  const scene = useQuery(campaign.scenes, () =>
    link.kind === "scene" ? campaign.sceneViews().find((s) => s.id === link.id) : undefined,
  );
  const note = useQuery(campaign.notes, () =>
    link.kind === "note" ? getNote(campaign, link.id) : undefined,
  );

  switch (link.kind) {
    case "item": {
      const item = system.items.find((i) => i.id === link.id);
      if (!item) return null;
      return (
        <EntryWindow
          entryKey={entryKey}
          windowId={entityTabId(`link:${linkKey(link)}`)}
          title={item.name}
          text={item.description}
          tags={item.tags}
          onClose={close}
          proxy={linkProxy(ctx, "item", item.id, item.name, item.icon)}
          menuItems={[
            ...linkActionItems(ctx, link),
            ...actionMenuItems(ctx, [{ id: `library:${item.id}`, title: item.name }]),
          ]}
        >
          <Button
            variant="primary"
            disabled={!canAct}
            onClick={() => me && ctx.execute(giveItem, { characterId: me.id, item })}
          >
            {me ? `Give to ${me.name}` : "Choose a Character First"}
          </Button>
        </EntryWindow>
      );
    }
    case "move": {
      const move = system.actions.find((m) => m.id === link.id);
      if (!move) return null;
      const { label, Icon } = makeVerb(move);
      const tag = rollTag(system, move);
      return (
        <EntryWindow
          entryKey={entryKey}
          windowId={entityTabId(`link:${linkKey(link)}`)}
          title={move.name}
          text={plainText(move.text)}
          body={<MoveBody campaign={campaign} move={move} characterId={me?.id ?? null} />}
          tags={tag ? [tag] : undefined}
          onClose={close}
          proxy={linkProxy(
            ctx,
            "move",
            move.id,
            move.name,
            move.category === "class" ? "class-move" : undefined,
          )}
          menuItems={[
            ...linkActionItems(ctx, link),
            ...actionMenuItems(ctx, [{ id: `move:${move.id}`, title: move.name }]),
          ]}
        >
          <Button
            variant="primary"
            disabled={!canAct}
            onClick={() => me && ctx.execute(startMove, { characterId: me.id, move: move.id })}
          >
            <Icon size={22} /> {label}
            {me ? ` as ${me.name}` : ""}
          </Button>
        </EntryWindow>
      );
    }
    case "character":
      return character ? (
        <LinkDialog
          campaign={campaign}
          link={link}
          title={character.name}
          menuItems={[
            {
              label: "Open in Sidebar",
              onSelect: () => ctx.links.followLink("character", character.id),
            },
          ]}
        >
          <div className="popup-sheet sheet-panel">
            <CharacterSheet campaign={campaign} system={system} c={character} />
          </div>
        </LinkDialog>
      ) : null;
    case "scene":
      return scene ? (
        <LinkDialog
          campaign={campaign}
          link={link}
          title={scene.name}
          menuItems={[
            {
              label: "Go to Scene",
              onSelect: () => ctx.links.followLink("scene", scene.id),
            },
          ]}
        >
          <p className="muted">A scene in this campaign.</p>
          <div className="form-actions">
            <Button variant="primary" onClick={() => ctx.links.followLink("scene", scene.id)}>
              Go to Scene
            </Button>
          </div>
        </LinkDialog>
      ) : null;
    case "note":
      return note ? (
        <LinkDialog
          campaign={campaign}
          link={link}
          title={note.title || "Untitled"}
          menuItems={[
            {
              label: "Open in Sidebar",
              onSelect: () => ctx.links.followLink("note", note.id),
            },
          ]}
        >
          <div className="link-note">
            <NoteEditor campaign={campaign} noteId={note.id} active />
          </div>
        </LinkDialog>
      ) : null;
  }
}

/** Change what a link says, or put its target's own name back. */
function RenameLink() {
  const ctx = useCampaign();
  const req = useQuery(ctx.linkPopups.linkRename);
  // A new pop-up for each request, opened as it mounts so the menu item's morph catches it.
  return req ? <RenameLinkDialog key={req.n} req={req} /> : null;
}

function RenameLinkDialog({ req }: { req: NonNullable<LinkPopupState["linkRename"]["value"]> }) {
  const ctx = useCampaign();
  const ref = usePopupDialog();
  // oxlint-disable-next-line react-doctor/no-derived-useState -- RenameLink keys this dialog by request id to reset the draft.
  const [text, setText] = useState(req.text);
  const onClose = () => ctx.linkPopups.linkRename.set(null);
  const done = (value: string | null) => {
    req.save(value);
    closePopup(ref.current, onClose);
  };
  return (
    <Dialog dialogRef={ref} title="Link text" onClose={onClose}>
      <form
        className="dialog-form"
        onSubmit={(e) => {
          e.preventDefault();
          done(text);
        }}
      >
        <label className="field">
          Show this link as
          <input
            value={text}
            autoFocus
            // Typing replaces it.
            onFocus={(e) => e.currentTarget.select()}
            onInput={(e) => setText(e.currentTarget.value)}
          />
        </label>
        <div className="form-actions">
          {req.custom && (
            <Button variant="ghost" className="form-actions-start" onClick={() => done(null)}>
              Use Its Own Name
            </Button>
          )}
          <Button variant="ghost" onClick={() => closePopup(ref.current, onClose)}>
            Cancel
          </Button>
          <Button variant="primary" type="submit">
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
