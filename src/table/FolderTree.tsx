import { useSignal } from "@preact/signals";
import type { ComponentChildren } from "preact";
import { IconFolder } from "../ui/icons";
import { FolderName } from "../ui/FolderName";
import { List, ListGroup } from "../ui/List";
import { menuTrigger } from "../ui/menuTrigger";
import { ContextMenu, type MenuItem } from "./ContextMenu";

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
  renderItem: (item: Item) => ComponentChildren;
  renderActions: (beginFolderNaming: () => void) => ComponentChildren;
  folderMenuItems: (folder: Folder, state: FolderMenuState) => MenuItem[];
  onCreateFolder: (name: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  emptyContent?: ComponentChildren;
}) {
  const folded = useSignal<Set<string>>(new Set());
  const naming = useSignal<string | null>(null);
  const menu = useSignal<{ x: number; y: number; items: MenuItem[] } | null>(
    null,
  );
  const known = new Set(folders.map((folder) => folder.id));
  const loose = items.filter((item) => {
    const folderId = folderOf(item);
    return !folderId || !known.has(folderId);
  });

  const toggle = (id: string) => {
    const next = new Set(folded.value);
    if (!next.delete(id)) next.add(id);
    folded.value = next;
  };

  return (
    <nav class={className} aria-label={ariaLabel}>
      <div class="chars-actions">
        {renderActions(() => (naming.value = "new"))}
      </div>
      <div class="chars-tree panel-scroll" data-folder-drop="">
        {naming.value === "new" && (
          <FolderName
            onDone={(name) => {
              if (name) onCreateFolder(name);
              naming.value = null;
            }}
          />
        )}
        {folders.map((folder) => {
          const children = items.filter((item) => folderOf(item) === folder.id);
          const open = !folded.value.has(folder.id);
          const trigger = menuTrigger((x, y) => {
            menu.value = {
              x,
              y,
              items: folderMenuItems(folder, {
                open,
                toggle: () => toggle(folder.id),
                rename: () => (naming.value = folder.id),
              }),
            };
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
                naming.value === folder.id ? (
                  <FolderName
                    initial={folder.name}
                    onDone={(name) => {
                      if (name) onRenameFolder(folder.id, name);
                      naming.value = null;
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
      {menu.value && (
        <ContextMenu {...menu.value} onClose={() => (menu.value = null)} />
      )}
    </nav>
  );
}
