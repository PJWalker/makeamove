import { useSignal } from "@preact/signals-react";
import { useEffect, useRef } from "react";
import {
  addItem,
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
import { setRelationship, setRelationshipDepth } from "../features/characters/relationships";
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
import { classCreationGuidance } from "../systems/dungeon-world-2/classGuidance";
import { parseCommaList } from "../lib/list";


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
  }, [selectedId, campaign.characters, go]);

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
              existingCharacters={characters}
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

function ClassCreationGuidance({ classId }: { classId: string }) {
  const guidance = classCreationGuidance(classId);
  if (!guidance) return null;
  return (
    <details className="field class-creation-guidance">
      <summary>Class creation prompts</summary>
      <h4>Origins</h4>
      <p>{guidance.origins}</p>
      <h4>Relationships</h4>
      <p>{guidance.relationships}</p>
      <h4>Equipment and appearance</h4>
      <p>{guidance.equipment}</p>
      <h4>Name and stats</h4>
      <p>{guidance.namesAndStats}</p>
    </details>
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
  existingCharacters,
  isGm,
  initialFolder,
  onDone,
}: {
  campaign: Campaign;
  system: GameSystem;
  folders: FolderView[];
  existingCharacters: CharacterView[];
  isGm: boolean;
  initialFolder?: string | undefined;
  onDone: () => void;
}) {
  const kind = useSignal<"pc" | "npc">("pc");
  const name = useSignal("");
  const pronouns = useSignal("");
  const ancestry = useSignal("");
  const community = useSignal("");
  const background = useSignal("");
  const relationshipTo = useSignal("");
  const relationshipText = useSignal("");
  const relationshipDepth = useSignal("0");
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
  const existingPcs = existingCharacters.filter((character) => character.kind === "pc");
  const duplicateClass =
    system.id === "dungeon-world-2" &&
    !!choiceData.classId &&
    existingPcs.some((character) => character.data.classId === choiceData.classId);
  const creationChoicesReady =
    !creation?.requireAllCreationChoicesAtCreate ||
    choices.every((choice) => choice.optional || !!picks.value[choice.id]?.option);
  const ready =
    kind.value === "npc" ||
    !creation ||
    (scoresReady(creation.scores, method.value, scores.value) &&
      creationChoicesReady &&
      (system.id !== "dungeon-world-2" || !existingPcs.length || !!relationshipTo.value));
  const submit = () => {
    if (!ready) return;
    if (kind.value === "npc")
      newNpc(campaign, name.value, folder.value || undefined);
    else {
      const made = creation
        ? creationResult(system, scores.value, picks.value)
        : undefined;
      if (made) {
        made.data.pronouns = pronouns.value.trim();
        made.data.ancestry = ancestry.value.trim();
        made.data.community = community.value.trim();
        made.data.background = background.value.trim();
      }
      const id = newCharacter(
        campaign,
        name.value,
        String(choiceData.classId ?? ""),
        made,
      );
      const startingItemsField = creation?.startingItemsField;
      if (startingItemsField && made) {
        for (const itemId of parseCommaList(String(made.data[startingItemsField] ?? ""))) {
          const item = system.items.find((entry) => entry.id === itemId);
          if (item) addItem(campaign, id, item, !!item.equippable);
        }
      }
      if (system.id === "dungeon-world-2" && relationshipTo.value) {
        setRelationship(campaign.characters, id, relationshipTo.value, relationshipText.value.trim());
        setRelationshipDepth(campaign.characters, id, relationshipTo.value, Number(relationshipDepth.value));
      }
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
          {system.id === "dungeon-world-2" && (
            <fieldset className="form-section creation-identity">
              <legend>Pronouns and Origins</legend>
              <label className="field">Pronouns<input value={pronouns.value} onInput={(event) => (pronouns.value = event.currentTarget.value)} /></label>
              <label className="field">Ancestry<input value={ancestry.value} onInput={(event) => (ancestry.value = event.currentTarget.value)} /></label>
              <label className="field">Community<input value={community.value} onInput={(event) => (community.value = event.currentTarget.value)} /></label>
              <label className="field">Background<input value={background.value} onInput={(event) => (background.value = event.currentTarget.value)} /></label>
            </fieldset>
          )}
          {system.id === "dungeon-world-2" && existingPcs.length > 0 && (
            <fieldset className="form-section creation-relationship">
              <legend>Relationship</legend>
              <label className="field">
                PC
                <select
                  required
                  value={relationshipTo.value}
                  onChange={(event) => (relationshipTo.value = event.currentTarget.value)}
                  onInput={(event) => (relationshipTo.value = event.currentTarget.value)}
                >
                  <option value="">Choose a PC</option>
                  {existingPcs.map((character) => (
                    <option key={character.id} value={character.id}>{character.name}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Relationship
                <textarea
                  rows={2}
                  value={relationshipText.value}
                  onInput={(event) => (relationshipText.value = event.currentTarget.value)}
                />
              </label>
              <label className="field">
                Shared history
                <select
                  value={relationshipDepth.value}
                  onChange={(event) => (relationshipDepth.value = event.currentTarget.value)}
                >
                  <option value="0">Just met</option>
                  <option value="1">Adventured together</option>
                  <option value="2">Grew up together</option>
                </select>
              </label>
            </fieldset>
          )}
          {choices.map((ch) => (
            <ChoiceField
              key={ch.id}
              system={system}
              choice={ch}
              value={picks.value[ch.id] ?? emptyPick()}
              onChange={(p) => (picks.value = { ...picks.value, [ch.id]: p })}
            />
          ))}
          {duplicateClass && (
            <p className="muted" role="status">
              Another PC already plays this Class. The group may prefer distinct Classes.
            </p>
          )}
          {choiceData.classId && (
            <ClassCreationGuidance classId={String(choiceData.classId)} />
          )}
          {creation && (
            <ScoreFields
              key={String(choiceData.classId ?? "generic")}
              system={system}
              methods={creation.scores}
              method={method}
              scores={scores}
              {...(creation.classScoreAssignments?.[String(choiceData.classId ?? "")]
                ? { assignments: creation.classScoreAssignments[String(choiceData.classId ?? "")] }
                : {})}
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
