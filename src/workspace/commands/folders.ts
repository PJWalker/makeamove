import { UNTITLED_FOLDER } from "../../campaign/folders";
import { isString, objectOf, optional } from "../../data/guards";
import type { Permission } from "../../kernel/commands";
import { IconDelete } from "../../ui/icons";
import type { CampaignContext } from "../campaignContext";
import { command, type FolderTreeKind, type TableCommand } from "./types";

/*
 * Folders work the same in every list that has them: make one, name it,
 * delete it (filing what was in it back at the top), and make something new
 * in it from its menu.
 */

interface FolderOps {
  permission?: Permission<CampaignContext, unknown>;
  create(ctx: CampaignContext, name: string): string;
  rename(ctx: CampaignContext, id: string, name: string): void;
  remove(ctx: CampaignContext, id: string): void;
  /** What makes new entries in the list, in a folder if given; offered in each folder's menu. */
  newHere?: TableCommand<{ folder?: string | undefined }, unknown>[];
}

export type FolderCommands = ReturnType<typeof folderCommands>;

export function folderCommands(tree: FolderTreeKind, ops: FolderOps) {
  const permission = ops.permission ?? "anyone";
  const create = command<{ name?: string | undefined }, string>({
    id: `${tree}Folder.create`,
    params: objectOf({ name: optional(isString) }),
    title: "New Folder",
    permission,
    run: (ctx, { name }) => ops.create(ctx, name ?? UNTITLED_FOLDER),
  });
  const rename = command<{ id: string; name: string }>({
    id: `${tree}Folder.rename`,
    params: objectOf({ id: isString, name: isString }),
    title: "Rename Folder",
    permission,
    run: (ctx, { id, name }) => ops.rename(ctx, id, name),
  });
  const remove = command<{ id: string }>({
    id: `${tree}Folder.delete`,
    params: objectOf({ id: isString }),
    title: "Delete Folder",
    icon: IconDelete,
    danger: true,
    permission,
    section: "delete",
    menu: { folder: (_, t) => (t.tree === tree ? [{ params: { id: t.id } }] : []) },
    run: (ctx, { id }) => ops.remove(ctx, id),
  });
  const newHere = (ops.newHere ?? []).map((make) =>
    command<{ folder: string }>({
      id: `${tree}Folder.${make.id}Here`,
      params: objectOf({ folder: isString }),
      title: (ctx, p) => `${titleOf(ctx, make, p)} Here`,
      ...(make.icon ? { icon: make.icon } : {}),
      permission: (ctx, p) => ctx.commands.permits(make, p),
      section: "open",
      menu: { folder: (_, t) => (t.tree === tree ? [{ params: { folder: t.id } }] : []) },
      run: (ctx, p) => ctx.execute(make, p),
    }),
  );
  return { create, rename, remove, all: [create, rename, remove, ...newHere] };
}

const titleOf = <P>(ctx: CampaignContext, c: TableCommand<P, unknown>, p: P) =>
  typeof c.title === "function" ? c.title(ctx, p) : c.title;
