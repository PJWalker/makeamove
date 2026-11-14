import { plainText } from "../data/richText";
import { MoveBody } from "../workspace/MoveBody";
import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
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
import { EntryWindow } from "../workspace/EntryWindow";
import { linkKey, type LinkRef } from "../workspace/linkState";
import { joinSections } from "../workspace/commands/views";
import { linkActionItems } from "../workspace/linkActions";
import { NoteEditor } from "./NoteEditor";
import { CharacterSheet } from "./sheets";
import { linkProxy } from "../workspace/linkProxy";
import { makeVerb, rollTag } from "../workspace/actionPresentation";
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

type PopupProps = { campaign: Campaign; link: LinkRef };

/** The character this device is playing, if they can change it: gear and moves go to them. */
function useActingCharacter(campaign: Campaign) {
  const me = useQuery(campaign.characters, () =>
    getCharacter(campaign, actingCharacterId(campaign)),
  );
  return { me, canAct: !!me && canEdit(campaign, me) };
}

/** What a link to a gear item or move offers from its menu: its action, and pinning it. */
function useEntryMenu(link: LinkRef, actionId: string, title: string) {
  const ctx = useCampaign();
  return joinSections([
    linkActionItems(ctx, link),
    actionMenuItems(ctx, [{ id: actionId, title }]),
  ]);
}

function ItemPopup({ campaign, link }: PopupProps) {
  const ctx = useCampaign();
  const { me, canAct } = useActingCharacter(campaign);
  const item = systemOf(campaign).items.find((i) => i.id === link.id);
  const menuItems = useEntryMenu(link, `library:${link.id}`, item?.name ?? "");
  if (!item) return null;
  return (
    <EntryWindow
      entryKey={`link:${linkKey(link)}`}
      windowId={entityTabId(`link:${linkKey(link)}`)}
      title={item.name}
      text={item.description}
      tags={item.tags}
      onClose={() => ctx.linkPopups.close(link)}
      proxy={linkProxy(ctx, "item", item.id, item.name, item.icon)}
      menuItems={menuItems}
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

function MovePopup({ campaign, link }: PopupProps) {
  const ctx = useCampaign();
  const system = systemOf(campaign);
  const { me, canAct } = useActingCharacter(campaign);
  const move = system.actions.find((m) => m.id === link.id);
  const menuItems = useEntryMenu(link, `move:${link.id}`, move?.name ?? "");
  if (!move) return null;
  const { label, Icon } = makeVerb(move);
  const tag = rollTag(system, move);
  return (
    <EntryWindow
      entryKey={`link:${linkKey(link)}`}
      windowId={entityTabId(`link:${linkKey(link)}`)}
      title={move.name}
      text={plainText(move.text)}
      body={<MoveBody campaign={campaign} move={move} characterId={me?.id ?? null} />}
      tags={tag ? [tag] : undefined}
      onClose={() => ctx.linkPopups.close(link)}
      proxy={linkProxy(
        ctx,
        "move",
        move.id,
        move.name,
        move.category === "class" ? "class-move" : undefined,
      )}
      menuItems={menuItems}
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

/** A pop-up for a link to something with a place in the sidebar or table: one menu item takes you there. */
function FollowDialog({
  campaign,
  link,
  title,
  followLabel,
  children,
}: PopupProps & { title: string; followLabel: string; children: ReactNode }) {
  const ctx = useCampaign();
  const menuItems = useMemo<MenuItem[]>(
    () => [{ label: followLabel, onSelect: () => ctx.links.followLink(link.kind, link.id) }],
    [ctx, link, followLabel],
  );
  return (
    <LinkDialog campaign={campaign} link={link} title={title} menuItems={menuItems}>
      {children}
    </LinkDialog>
  );
}

function CharacterPopup({ campaign, link }: PopupProps) {
  const character = useQuery(campaign.characters, () => getCharacter(campaign, link.id));
  if (!character) return null;
  return (
    <FollowDialog
      campaign={campaign}
      link={link}
      title={character.name}
      followLabel="Open in Sidebar"
    >
      <div className="popup-sheet sheet-panel">
        <CharacterSheet campaign={campaign} system={systemOf(campaign)} c={character} />
      </div>
    </FollowDialog>
  );
}

function ScenePopup({ campaign, link }: PopupProps) {
  const ctx = useCampaign();
  const scene = useQuery(campaign.scenes, () =>
    campaign.sceneViews().find((s) => s.id === link.id),
  );
  if (!scene) return null;
  return (
    <FollowDialog campaign={campaign} link={link} title={scene.name} followLabel="Go to Scene">
      <p className="muted">A scene in this campaign.</p>
      <div className="form-actions">
        <Button variant="primary" onClick={() => ctx.links.followLink("scene", scene.id)}>
          Go to Scene
        </Button>
      </div>
    </FollowDialog>
  );
}

function NotePopup({ campaign, link }: PopupProps) {
  const note = useQuery(campaign.notes, () => getNote(campaign, link.id));
  if (!note) return null;
  return (
    <FollowDialog
      campaign={campaign}
      link={link}
      title={note.title || "Untitled"}
      followLabel="Open in Sidebar"
    >
      <div className="link-note">
        <NoteEditor campaign={campaign} noteId={note.id} active />
      </div>
    </FollowDialog>
  );
}

const POPUPS: Record<LinkRef["kind"], (props: PopupProps) => ReactNode> = {
  item: ItemPopup,
  move: MovePopup,
  character: CharacterPopup,
  scene: ScenePopup,
  note: NotePopup,
};

function LinkPopup(props: PopupProps) {
  const Popup = POPUPS[props.link.kind];
  return <Popup {...props} />;
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
            // The popup opens on a click, for this one field.
            // react-doctor-disable-next-line react-doctor/no-autofocus
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
