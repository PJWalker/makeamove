import { Fragment, useEffect, useRef, useState } from "react";
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
import type { ChoiceDef, GameSystem } from "../systems/types";
import { HintedField } from "../ui/HintedField";
import { Button } from "../ui/Button";
import { IconImage } from "../ui/icons";
import { menuTrigger } from "../ui/menuTrigger";
import { CLASS_FIELD, choicesAt } from "../features/characters/creation";
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
import { ContextMenu, type MenuItem } from "../ui/ContextMenu";
import { dragEntity, entity } from "./entityDrag";
import { CampaignEntityGraphic } from "./EntityGraphic";
import { editEntityGraphic } from "./GraphicDialogs";
import { CharacterSheet } from "./sheets";
import { showLink } from "./linkState";
import { FolderTree } from "./FolderTree";
import { charactersLayout } from "./panelLayouts";
import { commaListOf } from "../lib/list";

export function CharactersPanel({ campaign }: { campaign: Campaign }) {
  const system = systemOf(campaign);
  const characters = useY(campaign.characters, () => listCharacters(campaign));
  const folders = useY(campaign.characterFolders, () => listFolders(campaign));
  const selectedId = useY(campaign.members, () => selectedCharacterId(campaign));
  const isGm = useY(campaign.members, () => campaign.isGm());
  const [creating, setCreating] = useState(false);
  const [creationFolder, setCreationFolder] = useState<string | undefined>(undefined);
  // Copies (a template's tokens) aren't listed, but selecting one's token opens its sheet.
  const selected = useY(campaign.characters, () => getCharacter(campaign, selectedId));
  // One at a time: which level shows, the list or the sheet.
  const { level, go } = usePaneLevel(charactersLayout, selectedId ? "detail" : "list");
  const seen = useRef(selectedId);
  useEffect(() => {
    // The open character was deleted: back to the list, not on to another sheet.
    if (seen.current && seen.current !== selectedId && !campaign.characters.has(seen.current))
      go("list");
    else if (seen.current !== selectedId && selectedId) go("detail");
    seen.current = selectedId;
  }, [selectedId, campaign.characters, go]);

  return (
    <TwoPane
      layout={charactersLayout}
      level={level}
      title={creating ? "New character" : (selected?.name ?? "Characters")}
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
            setCreationFolder(folderId);
            setCreating(true);
            go("detail");
          }}
          onPick={(id) => {
            setCreating(false);
            go("detail");
            selectCharacter(campaign, id);
          }}
        />
      }
      detail={
        <div className="chars-sheet panel-scroll sheet-panel">
          {creating ? (
            <NewCharacter
              campaign={campaign}
              system={system}
              folders={folders}
              existingCharacters={characters}
              isGm={isGm}
              initialFolder={creationFolder}
              onDone={() => {
                setCreating(false);
                setCreationFolder(undefined);
              }}
            />
          ) : selected ? (
            <CharacterSheet campaign={campaign} system={system} c={selected} />
          ) : (
            <p className="empty">Create a character, or pick one to see its sheet.</p>
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
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  // A character waiting for its deletion to be confirmed.
  const [deleting, setDeleting] = useState<string | null>(null);
  const known = new Set(folders.map((f) => f.id));

  const row = (c: CharacterView) => {
    const mine = canEdit(campaign, c);
    const dragged = entity(campaign, "character", c.id, c.name);
    if (mine) dragged.folder = (folderId) => moveToFolder(campaign, c.id, folderId);
    else delete dragged.folder;
    const trigger = menuTrigger((x, y) => {
      const items: MenuItem[] = [{ label: "Open Character", onSelect: () => onPick(c.id) }];
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
            label: "Remove from Folder",
            onSelect: () => moveToFolder(campaign, c.id, undefined),
          });
        if (items.length) items.push("divider");
        items.push({
          label: "Change Graphic…",
          Icon: IconImage,
          onSelect: () => editEntityGraphic(campaign, "character", c.id, c.name),
        });
        items.push({
          label: "Delete Character…",
          Icon: IconDelete,
          danger: true,
          onSelect: () => setDeleting(c.id),
        });
      }
      if (items.length) setMenu({ x, y, items });
    });
    return (
      <ListRow
        key={c.id}
        lead={<CampaignEntityGraphic campaign={campaign} kind="character" id={c.id} size={22} />}
        name={c.name}
        tag={c.kind === "npc" ? "NPC" : null}
        selected={c.id === selectedId}
        onPick={() => onPick(c.id)}
        row={{
          "data-tip": c.kind === "npc" ? `${c.name} (NPC)` : c.name,
          "data-tip-side": true,
        }}
        pick={{
          onDoubleClick: (e) => showLink({ kind: "character", id: c.id }, e.currentTarget),
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

  const doomed = deleting ? characters.find((c) => c.id === deleting) : undefined;
  return (
    <>
      {doomed && (
        <DeleteCharacter campaign={campaign} c={doomed} onClose={() => setDeleting(null)} />
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
              New Folder
            </Button>
          </>
        )}
        folderMenuItems={(folder, { open, toggle, rename }) => [
          { label: "New Character Here", onSelect: () => onNew(folder.id) },
          {
            label: open ? "Collapse Folder" : "Expand Folder",
            onSelect: toggle,
          },
          "divider",
          { label: "Rename Folder", Icon: IconRename, onSelect: rename },
          {
            label: "Delete Folder",
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
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
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
  const [kind, setKind] = useState<"pc" | "npc">("pc");
  const [name, setName] = useState("");
  const [identity, setIdentity] = useState<Record<string, string>>({});
  const [relationshipTo, setRelationshipTo] = useState("");
  const [relationshipText, setRelationshipText] = useState("");
  const [relationshipDepth, setDepth] = useState("0");
  const [folder, setFolder] = useState(initialFolder ?? "");
  // The guided flow: the system's choices at creation, then ability scores.
  const creation = system.creation;
  const [picks, setPicks] = useState<Record<string, Picked>>(
    Object.fromEntries(
      (creation?.choices ?? []).flatMap((choice) => {
        const value = system.characterData.find((field) => field.id === choice.field)?.default;
        return choice.at === "create" && typeof value === "string" && value
          ? [[choice.id, { option: value, pattern: 0, order: [] }]]
          : [];
      }),
    ),
  );
  const [method, setMethod] = useState<ScoreMethod>(() =>
    creation ? scoreMethods(creation.scores)[0]!.id : "manual",
  );
  const [scores, setScores] = useState<Record<string, number>>(() =>
    creation ? startingScores(system, creation.scores, method) : {},
  );
  const choiceData = Object.fromEntries(
    (creation?.choices ?? []).flatMap((choice) => {
      const option = choice.options.find((item) => item.id === picks[choice.id]?.option);
      return option ? [[choice.field, option.id], ...Object.entries(option.grants ?? [])] : [];
    }),
  );
  const defaults = Object.fromEntries(
    system.characterData
      .filter((field) => !field.for || field.for === kind)
      .map((field) => [field.id, field.default]),
  );
  const choices = choicesAt(creation, "create", { ...defaults, ...choiceData });
  const existingPcs = existingCharacters.filter((character) => character.kind === "pc");
  const distinct = creation?.distinct;
  const repeatsChoice =
    !!distinct &&
    !!choiceData[distinct.field] &&
    existingPcs.some((character) => character.data[distinct.field] === choiceData[distinct.field]);
  const startingRelationship =
    kind === "pc" && existingPcs.length > 0 ? creation?.startingRelationship : undefined;
  const scoreRule = creation?.classScoreRules?.[String(choiceData[CLASS_FIELD] ?? "")];
  const hints = creation?.hints?.({ ...defaults, ...choiceData }) ?? {};
  const creationChoicesReady =
    !creation?.requireAllCreationChoicesAtCreate ||
    choices.every((choice) => choice.optional || !!picks[choice.id]?.option);
  const ready =
    kind === "npc" ||
    !creation ||
    (scoresReady(system, creation.scores, method, scores, scoreRule) &&
      creationChoicesReady &&
      (!startingRelationship || !!relationshipTo));
  const classChoice = choices.find((choice) => choice.field === CLASS_FIELD);
  const otherChoices = choices.filter((choice) => choice !== classChoice);
  const choiceField = (choice: ChoiceDef) => (
    <Fragment key={choice.id}>
      <ChoiceField
        system={system}
        choice={choice}
        value={picks[choice.id] ?? emptyPick()}
        onChange={(p) => setPicks({ ...picks, [choice.id]: p })}
      />
      {repeatsChoice && distinct?.field === choice.field && (
        <p className="muted" role="status">
          {distinct.note}
        </p>
      )}
    </Fragment>
  );
  const submit = () => {
    if (!ready) return;
    if (kind === "npc") newNpc(campaign, name, folder || undefined);
    else {
      const made = creation ? creationResult(system, scores, picks) : undefined;
      if (made)
        for (const { field } of creation?.identity?.fields ?? [])
          made.data[field] = (identity[field] ?? "").trim();
      const id = newCharacter(campaign, name, String(choiceData[CLASS_FIELD] ?? ""), made);
      const startingItemsField = creation?.startingItemsField;
      if (startingItemsField && made) {
        for (const itemId of commaListOf(made.data[startingItemsField])) {
          const item = system.items.find((entry) => entry.id === itemId);
          if (item) addItem(campaign, id, item, !!item.equippable);
        }
      }
      if (startingRelationship && relationshipTo) {
        setRelationship(campaign.characters, id, relationshipTo, relationshipText.trim());
        setRelationshipDepth(
          campaign.characters,
          id,
          relationshipTo,
          Number(relationshipDepth),
          system.relationshipDepth?.max ?? 0,
        );
      }
      if (folder) moveToFolder(campaign, id, folder);
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
        <div className="field field-inline">
          Type
          <Segmented
            label="Character type"
            value={kind}
            options={[
              { id: "pc", label: "Player character" },
              { id: "npc", label: "NPC" },
            ]}
            onChange={(v) => setKind(v)}
          />
        </div>
      )}
      {kind === "pc" && classChoice && choiceField(classChoice)}
      <HintedField label="Name" hint={kind === "pc" ? hints.name : undefined}>
        {(input) => (
          <input
            {...input}
            value={name}
            onInput={(e) => setName(e.currentTarget.value)}
            autoFocus
          />
        )}
      </HintedField>
      {kind === "pc" && creation && (
        <>
          {creation.identity && (
            <fieldset className="form-section creation-identity">
              <legend>{creation.identity.label}</legend>
              {creation.identity.fields.map(({ field, label }) => (
                <HintedField key={field} label={label} hint={hints.identity?.[field]}>
                  {(input) => (
                    <input
                      {...input}
                      value={identity[field] ?? ""}
                      onInput={(event) =>
                        setIdentity({ ...identity, [field]: event.currentTarget.value })
                      }
                    />
                  )}
                </HintedField>
              ))}
            </fieldset>
          )}
          {startingRelationship && (
            <fieldset className="form-section creation-relationship">
              <legend>Relationship</legend>
              <label className="field field-inline">
                PC
                <select
                  required
                  value={relationshipTo}
                  onChange={(event) => setRelationshipTo(event.currentTarget.value)}
                  onInput={(event) => setRelationshipTo(event.currentTarget.value)}
                >
                  <option value="">Choose a PC</option>
                  {existingPcs.map((character) => (
                    <option key={character.id} value={character.id}>
                      {character.name}
                    </option>
                  ))}
                </select>
              </label>
              <HintedField label="Relationship" hint={hints.relationship}>
                {(input) => (
                  <textarea
                    {...input}
                    rows={2}
                    value={relationshipText}
                    onInput={(event) => setRelationshipText(event.currentTarget.value)}
                  />
                )}
              </HintedField>
              <label className="field field-inline">
                Shared history
                <select
                  value={relationshipDepth}
                  onChange={(event) => setDepth(event.currentTarget.value)}
                >
                  {startingRelationship.depths.map((depth) => (
                    <option key={depth.value} value={String(depth.value)}>
                      {depth.label}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>
          )}
          {otherChoices.map(choiceField)}
          {creation && (
            <ScoreFields
              key={String(choiceData[CLASS_FIELD] ?? "generic")}
              system={system}
              methods={creation.scores}
              method={method}
              onMethod={setMethod}
              scores={scores}
              onScores={setScores}
              hint={hints.scores}
              rule={scoreRule}
            />
          )}
        </>
      )}
      {folders.length > 0 && (
        <label className="field field-inline">
          Folder
          <select value={folder} onChange={(e) => setFolder(e.currentTarget.value)}>
            <option value="">None</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="form-actions">
        <Button variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" type="submit" disabled={!ready}>
          Create
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
        Delete <strong>{c.name}</strong>? Their sheet is gone for everyone, and tokens on the map
        stop being linked to them. This can&apos;t be undone.
      </p>
    </ConfirmDialog>
  );
}
