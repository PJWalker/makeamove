import { useSignal } from "@preact/signals-react";
import { useEffect, useRef } from "react";
import {
  canEdit,
  createFolder,
  deleteFolder,
  listCharacters,
  listFolders,
  moveToFolder,
  deleteCharacter,
  newCharacter,
  newNpc,
  renameFolder,
  type FolderView,
  getCharacter,
  selectCharacter,
  selectedCharacterId,
  systemOf,
} from "../features/characters/api";
import type { CharacterView } from "../features/characters/types";
import type { Campaign } from "../campaign/campaign";
import { useY } from "../ui/useY";
import type { GameSystem } from "../systems/types";
import { Button } from "../ui/Button";
import { IconImage } from "../ui/icons";
import { menuTrigger } from "../ui/menuTrigger";
import { choicesAt } from "../features/characters/creation";
import {
  ChoiceField,
  creationResult,
  emptyPick,
  ScoreFields,
  scoreMethods,
  scoresReady,
  startingScores,
  type Picked,
  type ScoreMethod,
} from "./CreationParts";
import { IconDelete, IconFolder, IconRename } from "../ui/icons";
import { Segmented } from "../ui/Segmented";
import { ConfirmDialog } from "./ConfirmDialog";
import { TwoPane, usePaneLevel } from "../ui/TwoPane";
import { ListRow } from "../ui/List";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { dragEntity, entity } from "./entityDrag";
import { CampaignEntityGraphic } from "./EntityGraphic";
import { editEntityGraphic } from "./GraphicDialogs";
import { CharacterSheet } from "./sheets";
import { showLink } from "./linkState";
import { FolderTree } from "./FolderTree";
import { charactersLayout } from "./panelLayouts";


export function CharactersPanel({ campaign }: { campaign: Campaign }) {
  const system = systemOf(campaign);
  const characters = useY(campaign.characters, () => listCharacters(campaign));
  const folders = useY(campaign.characterFolders, () => listFolders(campaign));
  const selectedId = useY(campaign.members, () =>
    selectedCharacterId(campaign),
  );
  const isGm = useY(campaign.members, () => campaign.isGm());
  const creating = useSignal(false);
  const creationFolder = useSignal<string | undefined>(undefined);
  // Copies (a template's tokens) aren't listed, but selecting one's token opens its sheet.
  const selected = useY(campaign.characters, () =>
    getCharacter(campaign, selectedId),
  );
  // One at a time: which level shows, the list or the sheet.
  const { level, go } = usePaneLevel(
    charactersLayout,
    selectedId ? "detail" : "list",
  );
  const seen = useRef(selectedId);
  useEffect(() => {
    // The open character was deleted: back to the list, not on to another sheet.
    if (
      seen.current &&
      seen.current !== selectedId &&
      !campaign.characters.has(seen.current)
    )
      go("list");
    else if (seen.current !== selectedId && selectedId) go("detail");
    seen.current = selectedId;
  }, [selectedId]);

  return (
    <TwoPane
      layout={charactersLayout}
      level={level.value}
      title={
        creating.value ? "New character" : (selected?.name ?? "Characters")
      }
      backLabel="Back to the character list"
      onBack={() => go("list")}
      resizeLabel="Resize character list"
      list={
        <CharacterList
          campaign={campaign}
          characters={characters}
          folders={folders}
          selectedId={selectedId}
          onNew={(folderId) => {
            creationFolder.value = folderId;
            creating.value = true;
            go("detail");
          }}
          onPick={(id) => {
            creating.value = false;
            go("detail");
            selectCharacter(campaign, id);
          }}
        />
      }
      detail={
        <div className="chars-sheet panel-scroll sheet-panel">
          {creating.value ? (
            <NewCharacter
              campaign={campaign}
              system={system}
              folders={folders}
              isGm={isGm}
              initialFolder={creationFolder.value}
              onDone={() => {
                creating.value = false;
                creationFolder.value = undefined;
              }}
            />
          ) : selected ? (
            <CharacterSheet campaign={campaign} system={system} c={selected} />
          ) : (
            <p className="empty">
              Create a character, or pick one to see its sheet.
            </p>
          )}
        </div>
      }
    />
  );
}

/** The left pane: characters, filed in folders. Drag a character onto a folder to file it. */
function CharacterList({
  campaign,
  characters,
  folders,
  selectedId,
  onNew,
  onPick,
}: {
  campaign: Campaign;
  characters: CharacterView[];
  folders: FolderView[];
  selectedId: string | undefined;
  onNew: (folderId?: string) => void;
  onPick: (id: string) => void;
}) {
  const menu = useSignal<{ x: number; y: number; items: MenuItem[] } | null>(
    null,
  );
  // A character waiting for its deletion to be confirmed.
  const deleting = useSignal<string | null>(null);
  const known = new Set(folders.map((f) => f.id));

  const row = (c: CharacterView) => {
    const mine = canEdit(campaign, c);
    const dragged = entity(campaign, "character", c.id, c.name);
    if (mine) dragged.folder = (folderId) => moveToFolder(campaign, c.id, folderId);
    else delete dragged.folder;
    const trigger = menuTrigger((x, y) => {
      const items: MenuItem[] = [
        { label: "Open character", onSelect: () => onPick(c.id) },
      ];
      if (mine) {
        for (const f of folders) {
          if (f.id !== c.folder)
            items.push({
              label: `Move to ${f.name}`,
              Icon: IconFolder,
              onSelect: () => moveToFolder(campaign, c.id, f.id),
            });
        }
        if (c.folder && known.has(c.folder))
          items.push({
            label: "Remove from folder",
            onSelect: () => moveToFolder(campaign, c.id, undefined),
          });
        if (items.length) items.push("divider");
        items.push({
          label: "Change graphic…",
          Icon: IconImage,
          onSelect: () =>
            editEntityGraphic(campaign, "character", c.id, c.name),
        });
        items.push({
          label: "Delete character…",
          Icon: IconDelete,
          danger: true,
          onSelect: () => (deleting.value = c.id),
        });
      }
      if (items.length) menu.value = { x, y, items };
    });
    return (
      <ListRow
        key={c.id}
        lead={
          <CampaignEntityGraphic
            campaign={campaign}
            kind="character"
            id={c.id}
            size={22}
          />
        }
        name={c.name}
        tag={c.kind === "npc" ? "NPC" : null}
        selected={c.id === selectedId}
        onPick={() => onPick(c.id)}
        row={{
          "data-tip": c.kind === "npc" ? `${c.name} (NPC)` : c.name,
          "data-tip-side": true,
        }}
        pick={{
          onDoubleClick: (e) =>
            showLink({ kind: "character", id: c.id }, e.currentTarget),
          "data-kind": c.kind,
          "data-item-drop": mine ? c.id : undefined,
          "data-move-drop": mine ? c.id : undefined,
          onPointerDown: (e) => {
            trigger.onPointerDown(e);
            dragEntity(e, dragged);
          },
          onContextMenu: trigger.onContextMenu,
        }}
      />
    );
  };

  const doomed = deleting.value
    ? characters.find((c) => c.id === deleting.value)
    : undefined;
  return (
    <>
      {doomed && (
        <DeleteCharacter
          campaign={campaign}
          c={doomed}
          onClose={() => (deleting.value = null)}
        />
      )}
      <FolderTree
        ariaLabel="Characters"
        className="chars-list"
        folders={folders}
        items={characters}
        folderOf={(character) => character.folder}
        renderItem={row}
        renderActions={(beginFolderNaming) => (
          <>
            <Button size="sm" onClick={() => onNew()}>
              New
            </Button>
            <Button size="sm" variant="ghost" onClick={beginFolderNaming}>
              New folder
            </Button>
          </>
        )}
        folderMenuItems={(folder, { open, toggle, rename }) => [
          { label: "New character here", onSelect: () => onNew(folder.id) },
          {
            label: open ? "Collapse folder" : "Expand folder",
            onSelect: toggle,
          },
          "divider",
          { label: "Rename folder", Icon: IconRename, onSelect: rename },
          {
            label: "Delete folder",
            Icon: IconDelete,
            danger: true,
            onSelect: () => deleteFolder(campaign, folder.id),
          },
        ]}
        onCreateFolder={(name) => createFolder(campaign, name)}
        onRenameFolder={(id, name) => renameFolder(campaign, id, name)}
        emptyContent={
          !characters.length && !folders.length ? (
            <p className="empty-inline">No characters yet.</p>
          ) : null
        }
      />
      {menu.value && (
        <ContextMenu {...menu.value} onClose={() => (menu.value = null)} />
      )}
    </>
  );
}

function NewCharacter({
  campaign,
  system,
  folders,
  isGm,
  initialFolder,
  onDone,
}: {
  campaign: Campaign;
  system: GameSystem;
  folders: FolderView[];
  isGm: boolean;
  initialFolder?: string | undefined;
  onDone: () => void;
}) {
  const kind = useSignal<"pc" | "npc">("pc");
  const name = useSignal("");
  const folder = useSignal(initialFolder ?? "");
  // The guided flow: the system's choices at creation, then ability scores.
  const creation = system.creation;
  const picks = useSignal<Record<string, Picked>>(
    Object.fromEntries(
      (creation?.choices ?? []).flatMap((choice) => {
        const value = system.characterData.find(
          (field) => field.id === choice.field,
        )?.default;
        return choice.at === "create" && typeof value === "string" && value
          ? [[choice.id, { option: value, pattern: 0, order: [] }]]
          : [];
      }),
    ),
  );
  const method = useSignal<ScoreMethod>(
    creation ? (scoreMethods(creation.scores))[0]!.id : "manual",
  );
  const scores = useSignal(
    creation ? startingScores(system, creation.scores, method.value) : {},
  );
  const choiceData = Object.fromEntries(
    (creation?.choices ?? []).flatMap((choice) => {
      const option = choice.options.find(
        (item) => item.id === picks.value[choice.id]?.option,
      );
      return option
        ? [[choice.field, option.id], ...Object.entries(option.grants ?? [])]
        : [];
    }),
  );
  const defaults = Object.fromEntries(
    system.characterData
      .filter((field) => !field.for || field.for === kind.value)
      .map((field) => [field.id, field.default]),
  );
  const choices = choicesAt(creation, "create", { ...defaults, ...choiceData });
  const ready =
    kind.value === "npc" ||
    !creation ||
    scoresReady(creation.scores, method.value, scores.value);
  const submit = () => {
    if (!ready) return;
    if (kind.value === "npc")
      newNpc(campaign, name.value, folder.value || undefined);
    else {
      const made = creation
        ? creationResult(system, scores.value, picks.value)
        : undefined;
      const id = newCharacter(
        campaign,
        name.value,
        String(choiceData.classId ?? ""),
        made,
      );
      if (folder.value) moveToFolder(campaign, id, folder.value);
    }
    onDone();
  };
  return (
    <form
      className="sheet-new"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {isGm && (
        <div className="field">
          Type
          <Segmented
            label="Character type"
            value={kind.value}
            options={[
              { id: "pc", label: "Player character" },
              { id: "npc", label: "NPC" },
            ]}
            onChange={(v) => (kind.value = v)}
          />
        </div>
      )}
      <label className="field">
        Name
        <input
          value={name.value}
          onInput={(e) => (name.value = e.currentTarget.value)}
          autoFocus
        />
      </label>
      {kind.value === "pc" && creation && (
        <>
          {choices.map((ch) => (
            <ChoiceField
              key={ch.id}
              system={system}
              choice={ch}
              value={picks.value[ch.id] ?? emptyPick()}
              onChange={(p) => (picks.value = { ...picks.value, [ch.id]: p })}
            />
          ))}
          {creation && (
            <ScoreFields
              system={system}
              methods={creation.scores}
              method={method}
              scores={scores}
            />
          )}
        </>
      )}
      {folders.length > 0 && (
        <label className="field">
          Folder
          <select
            value={folder.value}
            onChange={(e) => (folder.value = e.currentTarget.value)}
          >
            <option value="">None</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="sheet-row">
        <Button variant="primary" size="sm" type="submit" disabled={!ready}>
          Create
        </Button>
        <Button variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** Asks before deleting a character: it can't be undone. */
function DeleteCharacter({
  campaign,
  c,
  onClose,
}: {
  campaign: Campaign;
  c: CharacterView;
  onClose: () => void;
}) {
  return (
    <ConfirmDialog
      title="Delete character"
      confirmLabel="Delete"
      confirmVariant="danger"
      onClose={onClose}
      onConfirm={() => deleteCharacter(campaign, c.id)}
    >
      <p>
        Delete <strong>{c.name}</strong>? Their sheet is gone for everyone, and
        tokens on the map stop being linked to them. This can't be undone.
      </p>
    </ConfirmDialog>
  );
}
