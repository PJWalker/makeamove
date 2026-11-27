import { useLayoutEffect, useRef, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { IconFolder, IconRename } from "../ui/icons";
import { FolderName } from "../ui/FolderName";
import { List, ListGroup } from "../ui/List";
import { menuTrigger } from "../ui/menuTrigger";
import { ContextMenu } from "../ui/ContextMenu";
import type { MenuItem } from "../ui/ContextMenu";
import { growFrom } from "../ui/morph";
import { useCampaign } from "../workspace/campaignContext";
import type { FolderCommands } from "../workspace/commands/folders";
import type { FolderTreeKind } from "../workspace/commands/types";
import { joinSections, menuFor } from "../workspace/commands/views";
import { PanelActions } from "./PanelActions";

interface FolderRecord {
  id: string;
  name: string;
}

export function FolderTree<Item, Folder extends FolderRecord>({
  ariaLabel,
  className,
  folders,
  items,
  folderOf,
  renderItem,
  renderActions,
  tree,
  folderCommands,
  folderMenuItems,
  showList,
  emptyContent,
}: {
  ariaLabel: string;
  className: string;
  folders: Folder[];
  items: Item[];
  folderOf: (item: Item) => string | undefined;
  renderItem: (item: Item) => ReactNode;
  /** The panel's creation buttons; `newFolder` is for a New Folder button's click. */
  renderActions: (newFolder: (e: MouseEvent<HTMLElement>) => void) => ReactNode;
  /** Which list's folders these are, for their menus' commands. */
  tree: FolderTreeKind;
  /** Making, naming and deleting the folders (commands/folders.ts). */
  folderCommands: FolderCommands;
  /** The panel's own entries for a folder's menu, beside the commands for it. */
  folderMenuItems?: (folder: Folder) => MenuItem[];
  /** Bring the tree into view, when the panel is showing something else in its place. */
  showList: () => Promise<void>;
  emptyContent?: ReactNode;
}) {
  const {
    folded,
    naming,
    menu,
    navRef,
    loose,
    newFolder,
    toggle,
    folderChildren,
    folderTrigger,
    finishRename,
    closeMenu,
  } = useFolderTree({ folders, items, folderOf, tree, folderCommands, folderMenuItems, showList });

  return (
    <nav ref={navRef} className={className} aria-label={ariaLabel}>
      <PanelActions>{renderActions(newFolder)}</PanelActions>
      <div className="chars-tree panel-scroll" data-folder-drop="">
        {folders.map((folder) => {
          const children = folderChildren(folder);
          const open = !folded.has(folder.id);
          const trigger = folderTrigger(folder, open);

          return (
            <ListGroup
              key={folder.id}
              label={folder.name}
              lead={<IconFolder size={22} />}
              count={children.length}
              open={open}
              onToggle={() => {
                toggle(folder.id);
              }}
              head={{
                onPointerDown: trigger.onPointerDown,
                onContextMenu: trigger.onContextMenu,
              }}
              group={{ "data-folder-drop": folder.id }}
              replaceHead={
                naming?.id === folder.id ? (
                  <FolderName
                    initial={folder.name}
                    onDone={(name) => {
                      finishRename(folder, name);
                    }}
                  />
                ) : undefined
              }
            >
              <List>{children.map(renderItem)}</List>
            </ListGroup>
          );
        })}
        <List>{loose.map(renderItem)}</List>
        {emptyContent}
      </div>
      {menu && <ContextMenu {...menu} onClose={closeMenu} />}
    </nav>
  );
}

function useFolderTree<Item, Folder extends FolderRecord>({
  folders,
  items,
  folderOf,
  tree,
  folderCommands,
  folderMenuItems,
  showList,
}: {
  folders: Folder[];
  items: Item[];
  folderOf: (item: Item) => string | undefined;
  tree: FolderTreeKind;
  folderCommands: FolderCommands;
  folderMenuItems: ((folder: Folder) => MenuItem[]) | undefined;
  showList: () => Promise<void>;
}) {
  const context = useCampaign();
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const [naming, setNaming] = useState<{ id: string; from?: DOMRect } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const navReference = useRef<HTMLElement>(null);
  const known = new Set(folders.map((folder) => folder.id));
  const loose = items.filter((item) => {
    const folderId = folderOf(item);
    return !folderId || !known.has(folderId);
  });
  const toggle = (id: string) => {
    setFolded((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  };
  const newFolder = (event: MouseEvent<HTMLElement>) => {
    const from = event.currentTarget.getBoundingClientRect();
    void showList().then(() => {
      const id = context.execute(folderCommands.create, {});
      if (id) setNaming({ id, from });
    });
  };
  const folderChildren = (folder: Folder) => items.filter((item) => folderOf(item) === folder.id);
  const folderTrigger = (folder: Folder, open: boolean) =>
    menuTrigger((x, y) => {
      setMenu({
        x,
        y,
        items: joinSections([
          [
            {
              label: open ? "Collapse Folder" : "Expand Folder",
              onSelect: () => {
                toggle(folder.id);
              },
            },
            ...(context.commands.permits(folderCommands.rename, { id: folder.id, name: "" }) ===
            true
              ? [
                  {
                    label: "Rename Folder",
                    Icon: IconRename,
                    onSelect: () => {
                      setNaming({ id: folder.id });
                    },
                  },
                ]
              : []),
          ],
          folderMenuItems?.(folder) ?? [],
          menuFor(context, { kind: "folder", tree, id: folder.id }),
        ]),
      });
    });
  const finishRename = (folder: Folder, name: string | null) => {
    if (name) context.execute(folderCommands.rename, { id: folder.id, name });
    setNaming(null);
  };
  useLayoutEffect(() => {
    if (!naming?.from) return;
    const group = navReference.current?.querySelector<HTMLElement>(
      `[data-folder-drop="${CSS.escape(naming.id)}"]`,
    );
    if (!group) return;
    group.scrollIntoView({ block: "nearest" });
    growFrom(group, naming.from);
  }, [naming]);
  return {
    folded,
    naming,
    menu,
    navRef: navReference,
    loose,
    newFolder,
    toggle,
    folderChildren,
    folderTrigger,
    finishRename,
    closeMenu: () => {
      setMenu(null);
    },
  };
}
