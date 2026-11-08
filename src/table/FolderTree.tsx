import type { ReactNode } from "react";
import { IconFolder } from "../ui/icons";
import { FolderName } from "../ui/FolderName";
import { List, ListGroup } from "../ui/List";
import { menuTrigger } from "../ui/menuTrigger";
import { ContextMenu, type MenuItem } from "../ui/ContextMenu";
import { PanelActions } from "./PanelActions";
import { useState } from "react";

type FolderRecord = { id: string; name: string };

type FolderMenuState = {
  open: boolean;
  toggle: () => void;
  rename: () => void;
};

export function FolderTree<Item, Folder extends FolderRecord>({
  ariaLabel,
  className,
  folders,
  items,
  folderOf,
  renderItem,
  renderActions,
  folderMenuItems,
  onCreateFolder,
  onRenameFolder,
  emptyContent,
}: {
  ariaLabel: string;
  className: string;
  folders: Folder[];
  items: Item[];
  folderOf: (item: Item) => string | undefined;
  renderItem: (item: Item) => ReactNode;
  renderActions: (beginFolderNaming: () => void) => ReactNode;
  folderMenuItems: (folder: Folder, state: FolderMenuState) => MenuItem[];
  onCreateFolder: (name: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  emptyContent?: ReactNode;
}) {
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const [naming, setNaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
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

  return (
    <nav className={className} aria-label={ariaLabel}>
      <PanelActions>
        {naming === "new" && (
          <FolderName
            onDone={(name) => {
              if (name) onCreateFolder(name);
              setNaming(null);
            }}
          />
        )}
        {naming !== "new" && renderActions(() => setNaming("new"))}
      </PanelActions>
      <div className="chars-tree panel-scroll" data-folder-drop="">
        {folders.map((folder) => {
          const children = items.filter((item) => folderOf(item) === folder.id);
          const open = !folded.has(folder.id);
          const trigger = menuTrigger((x, y) => {
            setMenu({
              x,
              y,
              items: folderMenuItems(folder, {
                open,
                toggle: () => toggle(folder.id),
                rename: () => setNaming(folder.id),
              }),
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
                naming === folder.id ? (
                  <FolderName
                    initial={folder.name}
                    onDone={(name) => {
                      if (name) onRenameFolder(folder.id, name);
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
