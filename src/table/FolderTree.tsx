import { useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { IconFolder, IconRename } from "../ui/icons";
import { FolderName } from "../ui/FolderName";
import { List, ListGroup } from "../ui/List";
import { menuTrigger } from "../ui/menuTrigger";
import { ContextMenu, type MenuItem } from "../ui/ContextMenu";
import { growFrom } from "../ui/morph";
import { PanelActions } from "./PanelActions";
import { useCampaign } from "../workspace/campaignContext";
import type { FolderCommands } from "../workspace/commands/folders";
import type { FolderTreeKind } from "../workspace/commands/types";
import { joinSections, menuFor } from "../workspace/commands/views";

type FolderRecord = { id: string; name: string };

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
  const ctx = useCampaign();
  const [folded, setFolded] = useState<Set<string>>(new Set());
  // The folder being named, and for one just made, the button it grows out of.
  const [naming, setNaming] = useState<{ id: string; from?: DOMRect } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const known = new Set(folders.map((folder) => folder.id));
  const loose = items.filter((item) => {
    const folderId = folderOf(item);
    return !folderId || !known.has(folderId);
  });

  const toggle = (id: string) => {
    const next = new Set(folded);
    if (!next.delete(id)) next.add(id);
    setFolded(next);
  };

  const newFolder = (e: MouseEvent<HTMLElement>) => {
    const from = e.currentTarget.getBoundingClientRect();
    void showList().then(() => {
      const id = ctx.execute(folderCommands.create, {});
      if (id) setNaming({ id, from });
    });
  };

  useLayoutEffect(() => {
    if (!naming?.from) return;
    const group = navRef.current?.querySelector<HTMLElement>(
      `[data-folder-drop="${CSS.escape(naming.id)}"]`,
    );
    if (!group) return;
    group.scrollIntoView({ block: "nearest" });
    growFrom(group, naming.from);
  }, [naming]);

  return (
    <nav ref={navRef} className={className} aria-label={ariaLabel}>
      <PanelActions>{renderActions(newFolder)}</PanelActions>
      <div className="chars-tree panel-scroll" data-folder-drop="">
        {folders.map((folder) => {
          const children = items.filter((item) => folderOf(item) === folder.id);
          const open = !folded.has(folder.id);
          const trigger = menuTrigger((x, y) => {
            setMenu({
              x,
              y,
              items: joinSections([
                [
                  {
                    label: open ? "Collapse Folder" : "Expand Folder",
                    onSelect: () => toggle(folder.id),
                  },
                  ...(ctx.commands.permits(folderCommands.rename, { id: folder.id, name: "" }) ===
                  true
                    ? [
                        {
                          label: "Rename Folder",
                          Icon: IconRename,
                          onSelect: () => setNaming({ id: folder.id }),
                        },
                      ]
                    : []),
                ],
                folderMenuItems?.(folder) ?? [],
                menuFor(ctx, { kind: "folder", tree, id: folder.id }),
              ]),
            });
          });

          return (
            <ListGroup
              key={folder.id}
              label={folder.name}
              lead={<IconFolder size={22} />}
              count={children.length}
              open={open}
              onToggle={() => toggle(folder.id)}
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
                      if (name) ctx.execute(folderCommands.rename, { id: folder.id, name });
                      setNaming(null);
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
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
    </nav>
  );
}
