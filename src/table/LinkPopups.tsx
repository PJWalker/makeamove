import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useMemo } from "react";
import { MoveBody } from "../workspace/MoveBody";
import { plainText } from "../data/richText";
import { getCharacter, systemOf } from "../features/characters/api";
import { getNote } from "../features/notes/api";
import { linkLabel } from "../features/notes/targets";
import type { Campaign } from "../campaign/campaign";
import { useQuery } from "../ui/useQuery";
import { Button } from "../ui/Button";
import { closePopup } from "../ui/popup";
import { CommitInput } from "../ui/CommitInput";
import { usePopupDialog } from "../workspace/usePopupDialog";
import { Dialog } from "../workspace/Dialog";
import { ContextMenu } from "../ui/ContextMenu";
import type { MenuItem } from "../ui/ContextMenu";
import { EntryWindow } from "../workspace/EntryWindow";
import type { LinkPopups as LinkPopupState } from "../workspace/linkState";
import { linkKey } from "../workspace/linkState";
import type { LinkRef as LinkReference } from "../workspace/linkState";
import { joinSections } from "../workspace/commands/views";
import { linkActionItems } from "../workspace/linkActions";
import { linkProxy } from "../workspace/linkProxy";
import { makeVerb, rollTag } from "../workspace/actionPresentation";
import { actionMenuItems } from "../workspace/actionMenu";
import { entityTabId } from "../workspace/entityWindowState";
import { useCampaign } from "../workspace/campaignContext";
import { giveItem, startMove } from "../workspace/commands/characters";
import { librarySlot, moveSlot } from "../features/characters/hotbar";
import { CharacterSheet } from "./sheets";
import { NoteEditor } from "./NoteEditor";
import { useActingCharacter } from "./useActingCharacter";

/*
 * What links in rich text open: a pop-up for each link clicked (gear and
 * moves with their rules, a character's sheet, a scene, a note's page),
 * the links' right-click menu, and renaming a link.
 */

export function LinkPopups({ campaign }: { campaign: Campaign }) {
  const context = useCampaign();
  useRestoreLinkPopups(campaign);
  const links = useQuery(context.linkPopups.openLinks);
  const menu = useQuery(context.linkPopups.linkMenu);
  return (
    <>
      {links.map((l) => (
        <LinkPopup key={linkKey(l)} campaign={campaign} link={l} />
      ))}
      {menu && (
        <ContextMenu
          {...menu}
          onClose={() => {
            context.linkPopups.linkMenu.set(null);
          }}
        />
      )}
      <RenameLink />
    </>
  );
}

function useRestoreLinkPopups(campaign: Campaign) {
  const context = useCampaign();
  useEffect(() => {
    const ids = [
      ...context.panels.layout.value.left.panels,
      ...context.panels.layout.value.right.panels,
      ...context.panels.layout.value.floating.map((w) => w.id),
    ];
    const restored = ids.flatMap((id) => {
      if (!id.startsWith("entity:link:")) return [];
      const key = id.slice("entity:link:".length);
      const split = key.indexOf(":");
      if (split === -1) return [];
      const kind = key.slice(0, split) as LinkReference["kind"];
      if (!["character", "item", "move", "note", "scene"].includes(kind)) return [];
      const link = { kind, id: key.slice(split + 1) };
      if (linkLabel(campaign, link.kind, link.id) === null) {
        context.windows.close(entityTabId(`link:${linkKey(link)}`));
        return [];
      }
      return [link];
    });
    const known = new Set(context.linkPopups.openLinks.value.map(linkKey));
    context.linkPopups.openLinks.set([
      ...context.linkPopups.openLinks.value,
      ...restored.filter((link) => !known.has(linkKey(link))),
    ]);
  }, [context, campaign]);
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
  link: LinkReference;
  title: string;
  children: ReactNode;
  menuItems?: MenuItem[];
}) {
  const context = useCampaign();
  const id = entityTabId(`link:${linkKey(link)}`);
  useLayoutEffect(() => {
    const proxy = linkProxy(context, link.kind, link.id, title);
    context.windows.register({
      id,
      title,
      graphicRef: { kind: proxy.kind, id: proxy.id },
      graphicDefaultIcon: proxy.defaultIcon,
      proxy,
      menuItems,
      content: children,
      close: () => {
        context.linkPopups.close(link);
      },
    });
  }, [context, campaign, id, link, title, children, menuItems]);
  return null;
}

interface PopupProperties {
  campaign: Campaign;
  link: LinkReference;
}

/** What a link to a gear item or move offers from its menu: its action, and pinning it. */
function useEntryMenu(link: LinkReference, actionId: string, title: string) {
  const context = useCampaign();
  return joinSections([
    linkActionItems(context, link),
    actionMenuItems(context, [{ id: actionId, title }]),
  ]);
}

function ItemPopup({ campaign, link }: PopupProperties) {
  const context = useCampaign();
  const { me, canAct } = useActingCharacter(campaign);
  const item = systemOf(campaign).items.find((index) => index.id === link.id);
  const menuItems = useEntryMenu(link, librarySlot(link.id), item?.name ?? "");
  if (!item) return null;
  return (
    <EntryWindow
      entryKey={`link:${linkKey(link)}`}
      windowId={entityTabId(`link:${linkKey(link)}`)}
      title={item.name}
      text={item.description}
      tags={item.tags}
      onClose={() => {
        context.linkPopups.close(link);
      }}
      proxy={linkProxy(context, "item", item.id, item.name, item.icon)}
      menuItems={menuItems}
    >
      <Button
        variant="primary"
        disabled={!canAct}
        onClick={() => me && context.execute(giveItem, { characterId: me.id, item })}
      >
        {me ? `Give to ${me.name}` : "Choose a Character First"}
      </Button>
    </EntryWindow>
  );
}

function MovePopup({ campaign, link }: PopupProperties) {
  const context = useCampaign();
  const system = systemOf(campaign);
  const { me, canAct } = useActingCharacter(campaign);
  const move = system.actions.find((m) => m.id === link.id);
  const menuItems = useEntryMenu(link, moveSlot(link.id), move?.name ?? "");
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
      onClose={() => {
        context.linkPopups.close(link);
      }}
      proxy={linkProxy(
        context,
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
        onClick={() => me && context.execute(startMove, { characterId: me.id, move: move.id })}
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
}: PopupProperties & { title: string; followLabel: string; children: ReactNode }) {
  const context = useCampaign();
  const menuItems = useMemo<MenuItem[]>(
    () => [
      {
        label: followLabel,
        onSelect: () => {
          context.links.followLink(link.kind, link.id);
        },
      },
    ],
    [context, link, followLabel],
  );
  return (
    <LinkDialog campaign={campaign} link={link} title={title} menuItems={menuItems}>
      {children}
    </LinkDialog>
  );
}

function CharacterPopup({ campaign, link }: PopupProperties) {
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

function ScenePopup({ campaign, link }: PopupProperties) {
  const context = useCampaign();
  const scene = useQuery(campaign.scenes, () =>
    campaign.sceneViews().find((s) => s.id === link.id),
  );
  if (!scene) return null;
  return (
    <FollowDialog campaign={campaign} link={link} title={scene.name} followLabel="Go to Scene">
      <p className="muted">A scene in this campaign.</p>
      <div className="form-actions">
        <Button
          variant="primary"
          onClick={() => {
            context.links.followLink("scene", scene.id);
          }}
        >
          Go to Scene
        </Button>
      </div>
    </FollowDialog>
  );
}

function NotePopup({ campaign, link }: PopupProperties) {
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

const POPUPS: Record<LinkReference["kind"], (properties: PopupProperties) => ReactNode> = {
  item: ItemPopup,
  move: MovePopup,
  character: CharacterPopup,
  scene: ScenePopup,
  note: NotePopup,
};

function LinkPopup(properties: PopupProperties) {
  const Popup = POPUPS[properties.link.kind];
  return <Popup {...properties} />;
}

/** Change what a link says, or put its target's own name back. */
function RenameLink() {
  const context = useCampaign();
  const request = useQuery(context.linkPopups.linkRename);
  // A new pop-up for each request, opened as it mounts so the menu item's morph catches it.
  return request ? <RenameLinkDialog key={request.n} req={request} /> : null;
}

function RenameLinkDialog({ req }: { req: NonNullable<LinkPopupState["linkRename"]["value"]> }) {
  const context = useCampaign();
  const reference = usePopupDialog();
  const onClose = () => {
    context.linkPopups.linkRename.set(null);
  };
  const done = (value: string | null) => {
    req.save(value);
  };
  return (
    <Dialog dialogRef={reference} title="Link Text" onClose={onClose}>
      <div className="dialog-form">
        <label className="field">
          Show this link as
          <CommitInput
            name="text"
            value={req.text}
            // The popup opens on a click, for this one field.
            // react-doctor-disable-next-line react-doctor/no-autofocus
            autoFocus
            onFocus={(e) => {
              e.currentTarget.select();
            }}
            onCommit={done}
            onBlur={() => {
              closePopup(reference.current, onClose);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") closePopup(reference.current, onClose);
            }}
          />
        </label>
        {req.custom && (
          <div className="form-actions">
            <Button
              variant="ghost"
              className="form-actions-start"
              onClick={() => {
                done(null);
                closePopup(reference.current, onClose);
              }}
            >
              Use Its Own Name
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
