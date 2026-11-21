import { useEffect, useRef, useState, type ComponentProps } from "react";
import {
  canEdit,
  listCharacters,
  listFolders,
  type FolderView,
  getCharacter,
  viewedCharacterId,
  systemOf,
} from "../features/characters/api";
import type { CharacterView } from "../features/characters/types";
import type { Campaign, MemberView } from "../campaign/campaign";
import { device } from "../platform/device";
import { useQuery } from "../ui/useQuery";
import type { ChoiceDef, GameSystem } from "../systems/types";
import { HintedField } from "../ui/HintedField";
import { Button } from "../ui/Button";
import { menuTrigger } from "../ui/menuTrigger";
import { CLASS_FIELD, choicesAt } from "../features/characters/creation";
import { ChoiceField, ScoreFields, type Picked } from "../workspace/CreationParts";
import {
  creationResult,
  emptyPick,
  scoreMethods,
  scoresReady,
  startingScores,
  type ScoreMethod,
} from "../workspace/creationModel";
import { IconAdd, IconNewFolder } from "../ui/icons";
import { Segmented } from "../ui/Segmented";
import { TwoPane } from "../ui/TwoPane";
import { usePaneLevel } from "../ui/paneLevel";
import { ListRow } from "../ui/List";
import { ContextMenu, type MenuItem } from "../ui/ContextMenu";
import { dragEntity } from "../workspace/entityDrag";
import { entity } from "../workspace/dragEntities";
import { CampaignEntityGraphic } from "../workspace/EntityGraphic";
import { CharacterSheet } from "./sheets";
import { FolderTree } from "./FolderTree";
import { charactersLayout } from "./panelLayouts";
import { useCampaign } from "../workspace/campaignContext";
import {
  characterFolders,
  fileCharacter,
  newCharacter,
  newNpc,
  viewSheet,
} from "../workspace/commands/characters";
import { menuFor } from "../workspace/commands/views";
import { isString } from "../lib/guards";

export function CharactersPanel({ campaign }: { campaign: Campaign }) {
  const context = useCampaign();
  const system = systemOf(campaign);
  const characters = useQuery(campaign.characters, () => listCharacters(campaign));
  const folders = useQuery(campaign.characterFolders, () => listFolders(campaign));
  const selectedId = useQuery(campaign.members, () => viewedCharacterId(campaign));
  const [creating, setCreating] = useState(false);
  const [creationFolder, setCreationFolder] = useState<string | undefined>();
  // Copies (a template's tokens) aren't listed, but selecting one's token opens its sheet.
  const selected = useQuery(campaign.characters, () => getCharacter(campaign, selectedId));
  // One at a time: which level shows, the list or the sheet.
  const { level, go, show } = usePaneLevel(charactersLayout, selectedId ? "detail" : "list");
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
            context.execute(viewSheet, { id });
          }}
          showList={() => show("list")}
        />
      }
      detail={
        <div className="chars-sheet panel-scroll sheet-panel">
          {creating ? (
            <NewCharacter
              system={system}
              folders={folders}
              existingCharacters={characters}
              initialFolder={creationFolder}
              onDone={() => {
                setCreating(false);
                setCreationFolder(undefined);
              }}
            />
          ) : (selected ? (
            <CharacterSheet campaign={campaign} system={system} c={selected} />
          ) : (
            <p className="empty">Create a character, or pick one to see its sheet.</p>
          ))}
        </div>
      }
    />
  );
}

/** Who plays a character, as the list shows it. */
function tagFor(player: MemberView | undefined) {
  if (!player) return;
  return player.id === device.value.id ? "You" : player.name;
}

/** A character row's tooltip: its name, and who plays it or that it's an NPC. */
function tipFor(character: CharacterView, player: MemberView | undefined) {
  if (character.kind === "npc") return `${character.name} (NPC)`;
  if (player) return `${character.name}, played by ${tagFor(player)}`;
  return character.name;
}

/** The left pane: characters, filed in folders. Drag a character onto a folder to file it. */
function CharacterList({
  campaign,
  characters,
  folders,
  selectedId,
  onNew,
  onPick,
  showList,
}: {
  campaign: Campaign;
  characters: CharacterView[];
  folders: FolderView[];
  selectedId: string | undefined;
  onNew: (folderId?: string) => void;
  onPick: (id: string) => void;
  showList: () => Promise<void>;
}) {
  const context = useCampaign();
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const members = useQuery(campaign.members, () => campaign.memberViews());
  const playedBy = new Map(members.flatMap((m) => (m.playing ? [[m.playing, m] as const] : [])));

  const row = (c: CharacterView) => {
    const mine = canEdit(campaign, c);
    const dragged = entity(context, "character", c.id, c.name);
    if (mine) dragged.folder = (folder) => void context.execute(fileCharacter, { id: c.id, folder });
    else delete dragged.folder;
    const player = playedBy.get(c.id);
    const trigger = menuTrigger((x, y) =>
      setMenu({ x, y, items: menuFor(context, { kind: "character", id: c.id }) }),
    );
    return (
      <ListRow
        key={c.id}
        lead={<CampaignEntityGraphic campaign={campaign} kind="character" id={c.id} size={22} />}
        name={c.name}
        tag={c.kind === "npc" ? "NPC" : (tagFor(player) ?? null)}
        selected={c.id === selectedId}
        onPick={() => onPick(c.id)}
        row={{
          "data-tip": tipFor(c, player),
          "data-tip-side": true,
        }}
        pick={{
          onDoubleClick: (e) =>
            context.linkPopups.show({ kind: "character", id: c.id }, e.currentTarget),
          "data-kind": c.kind,
          "data-item-drop": mine ? c.id : undefined,
          "data-move-drop": mine ? c.id : undefined,
          onPointerDown: (e) => {
            trigger.onPointerDown(e);
            dragEntity(context.canvas, e, dragged);
          },
          onContextMenu: trigger.onContextMenu,
        }}
      />
    );
  };

  return (
    <>
      <FolderTree
        ariaLabel="Characters"
        className="chars-list"
        folders={folders}
        items={characters}
        folderOf={(character) => character.folder}
        renderItem={row}
        renderActions={(newFolder) => (
          <>
            <Button icon={IconAdd} onClick={() => onNew()}>
              New
            </Button>
            <Button variant="ghost" icon={IconNewFolder} onClick={newFolder}>
              New Folder
            </Button>
          </>
        )}
        tree="character"
        folderCommands={characterFolders}
        folderMenuItems={(folder) => [
          { label: "New Character Here", onSelect: () => onNew(folder.id) },
        ]}
        showList={showList}
        emptyContent={
          characters.length === 0 && folders.length === 0 ? (
            <p className="empty-inline">No characters yet.</p>
          ) : null
        }
      />
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
    </>
  );
}

type RelationshipDraft = { to: string; text: string; depth: string };

/** The free-text lines that describe a new character. */
function IdentityFields({
  identity,
  hints,
  values,
  onChange,
}: {
  identity: NonNullable<NonNullable<GameSystem["creation"]>["identity"]>;
  hints: Record<string, string> | undefined;
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
}) {
  return (
    <fieldset className="form-section creation-identity">
      <legend>{identity.label}</legend>
      {identity.fields.map(({ field, label }) => (
        <HintedField key={field} label={label} hint={hints?.[field]}>
          {(input) => (
            <input
              {...input}
              value={values[field] ?? ""}
              onInput={(event) => onChange({ ...values, [field]: event.currentTarget.value })}
            />
          )}
        </HintedField>
      ))}
    </fieldset>
  );
}

/** A new PC's starting bond with an existing one. */
function RelationshipFields({
  depths,
  pcs,
  hint,
  value,
  onChange,
}: {
  depths: readonly { value: number; label: string }[];
  pcs: CharacterView[];
  hint: string | undefined;
  value: RelationshipDraft;
  onChange: (value: RelationshipDraft) => void;
}) {
  return (
    <fieldset className="form-section creation-relationship">
      <legend>Relationship</legend>
      <label className="field field-inline">
        PC
        <select
          required
          value={value.to}
          onChange={(event) => onChange({ ...value, to: event.currentTarget.value })}
          onInput={(event) => onChange({ ...value, to: event.currentTarget.value })}
        >
          <option value="">Choose a PC</option>
          {pcs.map((character) => (
            <option key={character.id} value={character.id}>
              {character.name}
            </option>
          ))}
        </select>
      </label>
      <HintedField label="Relationship" hint={hint}>
        {(input) => (
          <textarea
            {...input}
            rows={2}
            value={value.text}
            onInput={(event) => onChange({ ...value, text: event.currentTarget.value })}
          />
        )}
      </HintedField>
      <label className="field field-inline">
        Shared history
        <select
          value={value.depth}
          onChange={(event) => onChange({ ...value, depth: event.currentTarget.value })}
        >
          {depths.map((depth) => (
            <option key={depth.value} value={String(depth.value)}>
              {depth.label}
            </option>
          ))}
        </select>
      </label>
    </fieldset>
  );
}

/** Which folder a new character goes in, when there are any. */
function FolderField({
  folders,
  value,
  onChange,
}: {
  folders: FolderView[];
  value: string;
  onChange: (id: string) => void;
}) {
  if (folders.length === 0) return null;
  return (
    <label className="field field-inline">
      Folder
      <select value={value} onChange={(e) => onChange(e.currentTarget.value)}>
        <option value="">None</option>
        {folders.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The options a new character starts with: each create-time choice's default. */
function initialPicks(system: GameSystem): Record<string, Picked> {
  return Object.fromEntries(
    (system.creation?.choices ?? []).flatMap((choice) => {
      const value = system.characterData.find((field) => field.id === choice.field)?.default;
      return choice.at === "create" && isString(value) && value
        ? [[choice.id, { option: value, pattern: 0, order: [] }]]
        : [];
    }),
  );
}

/** What guided creation produces, with the identity lines filled in. */
function madeCharacter(
  system: GameSystem,
  scores: Record<string, number>,
  picks: Record<string, Picked>,
  identity: Record<string, string>,
) {
  if (!system.creation) return;
  const made = creationResult(system, scores, picks);
  for (const { field } of system.creation.identity?.fields ?? [])
    made.data[field] = (identity[field] ?? "").trim();
  return made;
}

/** A drafted relationship as the command takes it, once a PC is chosen. */
function relationshipOf({ to, text, depth }: RelationshipDraft) {
  return to ? { to, label: text, depth: Number(depth) } : undefined;
}

/** What a new character's current picks imply: its data, the choices on offer, and whether they're complete. */
function deriveCreation({
  system,
  kind,
  picks,
  existingCharacters,
}: {
  system: GameSystem;
  kind: "pc" | "npc";
  picks: Record<string, Picked>;
  existingCharacters: CharacterView[];
}) {
  const creation = system.creation;
  const choiceData = Object.fromEntries(
    (creation?.choices ?? []).flatMap((choice) => {
      const option = choice.options.find((item) => item.id === picks[choice.id]?.option);
      return option ? [[choice.field, option.id], ...Object.entries(option.grants ?? [])] : [];
    }),
  );
  const defaults = Object.fromEntries(
    system.characterData.flatMap((field) =>
      !field.for || field.for === kind ? [[field.id, field.default]] : [],
    ),
  );
  const data = { ...defaults, ...choiceData };
  const choices = choicesAt(creation, "create", data);
  const existingPcs = existingCharacters.filter((character) => character.kind === "pc");
  const distinct = creation?.distinct;
  const repeatsChoice =
    !!distinct &&
    !!choiceData[distinct.field] &&
    existingPcs.some((character) => character.data[distinct.field] === choiceData[distinct.field]);
  return {
    choiceData,
    choices,
    existingPcs,
    repeat: repeatsChoice ? distinct : undefined,
    startingRelationship:
      kind === "pc" && existingPcs.length > 0 ? creation?.startingRelationship : undefined,
    scoreRule: creation?.classScoreRules?.[String(choiceData[CLASS_FIELD] ?? "")],
    hints: creation?.hints?.(data) ?? {},
    ready:
      !creation?.requireAllCreationChoicesAtCreate ||
      choices.every((choice) => choice.optional || !!picks[choice.id]?.option),
  };
}

/** One of the choices made while creating a character, with a note when it repeats another PC's. */
function CreationChoice({
  note,
  ...properties
}: ComponentProps<typeof ChoiceField> & { note: string | undefined }) {
  return (
    <>
      <ChoiceField {...properties} />
      {note && <output className="muted">{note}</output>}
    </>
  );
}

/** Whether a new character is a PC or an NPC, for whoever may make NPCs. */
function KindField({
  kind,
  onChange,
}: {
  kind: "pc" | "npc";
  onChange: (kind: "pc" | "npc") => void;
}) {
  const context = useCampaign();
  if (context.commands.permits(newNpc, {}) !== true) return null;
  return (
    <div className="field field-inline">
      Type
      <Segmented
        label="Character type"
        value={kind}
        options={[
          { id: "pc", label: "Player character" },
          { id: "npc", label: "NPC" },
        ]}
        onChange={onChange}
      />
    </div>
  );
}

function NewCharacter({
  system,
  folders,
  existingCharacters,
  initialFolder,
  onDone,
}: {
  system: GameSystem;
  folders: FolderView[];
  existingCharacters: CharacterView[];
  initialFolder?: string | undefined;
  onDone: () => void;
}) {
  const {
    kind,
    setKind,
    name,
    setName,
    identity,
    setIdentity,
    relationship,
    setRelationship,
    folder,
    setFolder,
    creation,
    choiceData,
    existingPcs,
    startingRelationship,
    scoreRule,
    hints,
    ready,
    classChoice,
    otherChoices,
    scores,
    method,
    setMethod,
    setScores,
    choiceField,
    submit,
  } = useNewCharacter(system, existingCharacters, initialFolder, onDone);

  return (
    <form
      className="sheet-new"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <KindField kind={kind} onChange={setKind} />
      {kind === "pc" && classChoice && choiceField(classChoice)}
      <HintedField label="Name" hint={kind === "pc" ? hints.name : undefined}>
        {(input) => (
          <input
            {...input}
            value={name}
            onInput={(event) => setName(event.currentTarget.value)}
            // The field is the dialog's one input.
            // react-doctor-disable-next-line react-doctor/no-autofocus
            autoFocus
          />
        )}
      </HintedField>
      {kind === "pc" && creation && (
        <>
          {creation.identity && (
            <IdentityFields
              identity={creation.identity}
              hints={hints.identity}
              values={identity}
              onChange={setIdentity}
            />
          )}
          {startingRelationship && (
            <RelationshipFields
              depths={startingRelationship.depths}
              pcs={existingPcs}
              hint={hints.relationship}
              value={relationship}
              onChange={setRelationship}
            />
          )}
          {otherChoices.map(choiceField)}
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
        </>
      )}
      <FolderField folders={folders} value={folder} onChange={setFolder} />
      <div className="form-actions">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" disabled={!ready}>
          Create
        </Button>
      </div>
    </form>
  );
}

function useNewCharacter(
  system: GameSystem,
  existingCharacters: CharacterView[],
  initialFolder: string | undefined,
  onDone: () => void,
) {
  const context = useCampaign();
  const [kind, setKind] = useState<"pc" | "npc">("pc");
  const [name, setName] = useState("");
  const [identity, setIdentity] = useState<Record<string, string>>({});
  const [relationship, setRelationship] = useState<RelationshipDraft>({
    to: "",
    text: "",
    depth: "0",
  });
  const [folder, setFolder] = useState(initialFolder ?? "");
  // The guided flow: the system's choices at creation, then ability scores.
  const creation = system.creation;
  const [picks, setPicks] = useState<Record<string, Picked>>(() => initialPicks(system));
  const [method, setMethod] = useState<ScoreMethod>(() =>
    creation ? scoreMethods(creation.scores)[0]!.id : "manual",
  );
  const [scores, setScores] = useState<Record<string, number>>(() =>
    creation ? startingScores(system, creation.scores, method) : {},
  );
  const {
    choiceData,
    choices,
    existingPcs,
    repeat,
    startingRelationship,
    scoreRule,
    hints,
    ready: creationReady,
  } = deriveCreation({ system, kind, picks, existingCharacters });
  const ready =
    kind === "npc" ||
    !creation ||
    (creationReady &&
      scoresReady(system, creation.scores, method, scores, scoreRule) &&
      (!startingRelationship || !!relationship.to));
  const classChoice = choices.find((choice) => choice.field === CLASS_FIELD);
  const otherChoices = choices.filter((choice) => choice !== classChoice);
  const choiceField = (choice: ChoiceDef) => (
    <CreationChoice
      key={choice.id}
      system={system}
      choice={choice}
      value={picks[choice.id] ?? emptyPick()}
      note={repeat?.field === choice.field ? repeat.note : undefined}
      onChange={(p) => setPicks({ ...picks, [choice.id]: p })}
    />
  );
  const submit = () => {
    if (!ready) return;
    if (kind === "npc") context.execute(newNpc, { name, folder: folder || undefined });
    else {
      context.execute(newCharacter, {
        name,
        classId: String(choiceData[CLASS_FIELD] ?? ""),
        made: madeCharacter(system, scores, picks, identity),
        folder: folder || undefined,
        relationship: startingRelationship && relationshipOf(relationship),
      });
    }
    onDone();
  };
  return {
    kind,
    setKind,
    name,
    setName,
    identity,
    setIdentity,
    relationship,
    setRelationship,
    folder,
    setFolder,
    creation,
    choiceData,
    existingPcs,
    startingRelationship,
    scoreRule,
    hints,
    ready,
    classChoice,
    otherChoices,
    scores,
    method,
    setMethod,
    setScores,
    choiceField,
    submit,
  };
}
