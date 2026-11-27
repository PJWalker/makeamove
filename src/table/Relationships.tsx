import type {
  InputEvent as ReactInputEvent,
  KeyboardEvent as ReactKeyboardEvent,
  RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { canEdit, getCharacter, listCharacters, systemOf } from "../features/characters/api";
import {
  relationshipNotes,
  relationshipsOf,
  relationshipWeb,
} from "../features/characters/relationships";
import type { Relationship } from "../features/characters/relationships";
import type { CharacterView } from "../features/characters/types";
import type { Campaign } from "../campaign/campaign";
import { useQuery } from "../ui/useQuery";
import { CommitInput } from "../ui/CommitInput";
import { Button } from "../ui/Button";
import { IconDelete, IconExpand } from "../ui/icons";
import { Dialog } from "../workspace/Dialog";
import { CharacterText } from "../workspace/CharacterText";
import { characterLinkTargets, matchingLinkTargets } from "../features/notes/targets";
import { useMenuOverlay } from "../ui/menuOverlay";
import { CampaignEntityGraphic } from "../workspace/EntityGraphic";
import { registerEntityDrop } from "../workspace/entityDrag";
import { extensionOf } from "../systems/extensions";
import { useCampaign } from "../workspace/campaignContext";
import { parseInputNumber } from "../lib/number";
import {
  removeRelationship,
  setRelationship,
  setRelationshipDepth,
} from "../workspace/commands/characters";
import { RelationshipWeb } from "./RelationshipWeb";

/*
 * Relationships (M9): a section on every character sheet listing how this
 * character sees others, each with notes; and a web of everyone's, in a
 * window anyone can open (campaign menu, palette, Characters panel).
 */

/** The Relationships section of a sheet. */
export function RelationshipsSection({ campaign, c }: { campaign: Campaign; c: CharacterView }) {
  const context = useCampaign();
  const editable = canEdit(campaign, c);
  const system = systemOf(campaign);
  const depth = system.relationshipDepth;
  const Extra = extensionOf(system).relationshipsExtra;
  const { rels, others } = useRelationshipData(campaign, c.id);
  const [open, setOpen] = useState<string | null>(null);
  const section = useRef<HTMLElement>(null);
  const add = useCallback(
    (to: string) => {
      const current = getCharacter(campaign, c.id);
      if (
        !current ||
        !canEdit(campaign, current) ||
        to === c.id ||
        !getCharacter(campaign, to) ||
        relationshipsOf(campaign.characters, c.id).some((relationship) => relationship.to === to)
      )
        return false;
      context.execute(setRelationship, { from: c.id, to, label: "" });
      setOpen(null);
      return true;
    },
    [context, campaign, c.id],
  );
  useRelationshipDrop(section, editable, others, add);

  return (
    <section ref={section} className="form-section sheet-section" aria-label="Relationships">
      <header className="sheet-section-header">
        <h3 className="sheet-heading">Relationships</h3>
        <Button
          variant="ghost"
          onClick={() => {
            context.canvas.dialogRequest.set("relationships");
          }}
        >
          Web
        </Button>
      </header>
      {rels.length > 0 && (
        <ul className="relationships">
          {rels.map((r) => {
            const other = getCharacter(campaign, r.to);
            if (!other) return null;
            return (
              <RelationshipRow
                key={r.to}
                campaign={campaign}
                c={c}
                relationship={r}
                other={other}
                editable={editable}
                depth={depth}
                expanded={open === r.to}
                onOpenCharacter={() => {
                  context.links.openCharacter(other.id);
                }}
                onLabelChange={(label) =>
                  context.execute(setRelationship, { from: c.id, to: r.to, label })
                }
                onDepthChange={(value) => {
                  if (!depth) return;
                  context.execute(setRelationshipDepth, {
                    from: c.id,
                    to: r.to,
                    depth: value,
                    max: depth.max,
                  });
                }}
                onToggleNotes={() => {
                  setOpen(open === r.to ? null : r.to);
                }}
                onRemove={() => context.execute(removeRelationship, { from: c.id, to: r.to })}
              />
            );
          })}
        </ul>
      )}
      {Extra && <Extra campaign={campaign} c={c} editable={editable} />}
      <RelationshipPicker campaign={campaign} editable={editable} targets={others} onAdd={add} />
    </section>
  );
}

function useRelationshipData(campaign: Campaign, characterId: string) {
  const relationshipsJson = useQuery(campaign.characters, () =>
    JSON.stringify(relationshipsOf(campaign.characters, characterId)),
  );
  const rels = useMemo(() => JSON.parse(relationshipsJson) as Relationship[], [relationshipsJson]);
  const peopleJson = useQuery(campaign.characters, () =>
    JSON.stringify(characterLinkTargets(campaign)),
  );
  const people = useMemo(
    () => JSON.parse(peopleJson) as ReturnType<typeof characterLinkTargets>,
    [peopleJson],
  );
  const others = useMemo(
    () =>
      people.filter(
        (person) =>
          person.id !== characterId && !rels.some((relationship) => relationship.to === person.id),
      ),
    [people, characterId, rels],
  );
  return { rels, others };
}

function useRelationshipDrop(
  section: RefObject<HTMLElement | null>,
  editable: boolean,
  others: ReturnType<typeof characterLinkTargets>,
  add: (id: string) => boolean,
) {
  useEffect(() => {
    const element = section.current;
    if (!element || !editable) return;
    return registerEntityDrop(
      element,
      (entity) =>
        entity.link?.kind === "character" && others.some((other) => other.id === entity.link?.id),
      (entity) => (entity.link ? add(entity.link.id) : false),
    );
  }, [section, editable, others, add]);
}

function RelationshipRow({
  campaign,
  c,
  relationship,
  other,
  editable,
  depth,
  expanded,
  onOpenCharacter,
  onLabelChange,
  onDepthChange,
  onToggleNotes,
  onRemove,
}: {
  campaign: Campaign;
  c: CharacterView;
  relationship: Relationship;
  other: CharacterView;
  editable: boolean;
  depth: { label: string; max: number } | undefined;
  expanded: boolean;
  onOpenCharacter: () => void;
  onLabelChange: (label: string) => void;
  onDepthChange: (depth: number) => void;
  onToggleNotes: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="relationship">
      <div className={`relationship-row${depth ? " has-depth" : ""}`}>
        <button type="button" className="relationship-name" onClick={onOpenCharacter}>
          {other.name}
        </button>
        <CommitInput
          aria-label={`How ${c.name} sees ${other.name}`}
          placeholder="Trusts, owes, fears…"
          value={relationship.label}
          disabled={!editable}
          onCommit={onLabelChange}
        />
        {depth && (
          <RelationshipDepthInput
            label={depth.label}
            max={depth.max}
            characterName={other.name}
            value={relationship.depth ?? 0}
            editable={editable}
            onChange={onDepthChange}
          />
        )}
        <Button
          variant="icon"
          label={expanded ? "Hide Notes" : "Notes"}
          pressed={expanded}
          onClick={onToggleNotes}
        >
          <IconExpand />
        </Button>
        {editable && (
          <Button variant="icon" label="Remove" onClick={onRemove}>
            <IconDelete />
          </Button>
        )}
      </div>
      {expanded && (
        <CharacterText
          campaign={campaign}
          c={c}
          field={relationshipNotes(relationship.to)}
          label="Notes"
          editable={editable}
        />
      )}
    </li>
  );
}

function RelationshipDepthInput({
  label,
  max,
  characterName,
  value,
  editable,
  onChange,
}: {
  label: string;
  max: number;
  characterName: string;
  value: number;
  editable: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="relationship-depth">
      {label}
      <input
        type="number"
        min={0}
        max={max}
        step={1}
        value={value}
        disabled={!editable}
        aria-label={`${label} with ${characterName}`}
        onChange={(event) => {
          const parsed = parseInputNumber(event.currentTarget.value);
          if (parsed !== undefined) onChange(parsed);
        }}
      />
    </label>
  );
}

function RelationshipPicker({
  campaign,
  editable,
  targets,
  onAdd,
}: {
  campaign: Campaign;
  editable: boolean;
  targets: ReturnType<typeof characterLinkTargets>;
  onAdd: (id: string) => boolean;
}) {
  const picker = useRelationshipPicker(targets, editable, onAdd);

  return (
    <>
      <RelationshipPickerInput
        editable={editable}
        input={picker.input}
        listId={picker.listId}
        expanded={picker.expanded}
        activeDescendant={picker.activeDescendant}
        value={picker.adding}
        onInput={picker.handleInput}
        onFocus={picker.handleFocus}
        onBlur={picker.handleBlur}
        onKeyDown={picker.handleKeyDown}
      />
      {picker.expanded &&
        createPortal(
          <RelationshipSuggestionList
            campaign={campaign}
            matches={picker.matches}
            index={picker.index}
            listId={picker.listId}
            panel={picker.panel}
            onSelect={picker.handleAdd}
            onPointerDown={handleRelationshipPointerDown}
          />,
          document.body,
        )}
    </>
  );
}

function handleRelationshipPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
  event.preventDefault();
}

function useRelationshipPicker(
  targets: ReturnType<typeof characterLinkTargets>,
  editable: boolean,
  onAdd: (id: string) => boolean,
) {
  const [adding, setAdding] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const listId = useId();
  const matches = matchingLinkTargets(targets, adding.replace(/^@/, ""));
  const expanded = editable && suggesting && adding.trim().length > 0;
  const index = Math.min(active, Math.max(0, matches.length - 1));
  const handleAdd = (id: string) => {
    if (!onAdd(id)) return;
    setAdding("");
    setSuggesting(false);
  };
  const handleInput = (event: ReactInputEvent<HTMLInputElement>) => {
    setAdding(event.currentTarget.value);
    setActive(0);
    setSuggesting(true);
  };
  const handleFocus = () => {
    setSuggesting(adding.trim().length > 0);
  };
  const handleBlur = () => {
    setSuggesting(false);
  };
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape" && expanded) {
      event.preventDefault();
      event.stopPropagation();
      setSuggesting(false);
    } else if (
      expanded &&
      matches.length > 0 &&
      (event.key === "ArrowDown" || event.key === "ArrowUp")
    ) {
      event.preventDefault();
      setActive((index + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length);
    } else if (expanded && matches[index] && (event.key === "Enter" || event.key === "Tab")) {
      if (event.key === "Enter") event.preventDefault();
      handleAdd(matches[index].id);
    }
  };

  useMenuOverlay({
    open: expanded,
    ref: panel,
    anchor: input,
    onDismiss: () => {
      setSuggesting(false);
    },
  });

  return {
    adding,
    expanded,
    index,
    input,
    listId,
    matches,
    panel,
    activeDescendant: expanded && matches[index] ? `${listId}-${matches[index].id}` : undefined,
    handleAdd,
    handleBlur,
    handleFocus,
    handleInput,
    handleKeyDown,
  };
}

function RelationshipPickerInput({
  editable,
  input,
  listId,
  expanded,
  activeDescendant,
  value,
  onInput,
  onFocus,
  onBlur,
  onKeyDown,
}: {
  editable: boolean;
  input: RefObject<HTMLInputElement | null>;
  listId: string;
  expanded: boolean;
  activeDescendant: string | undefined;
  value: string;
  onInput: (event: ReactInputEvent<HTMLInputElement>) => void;
  onFocus: () => void;
  onBlur: () => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="sheet-row">
      {editable && (
        <input
          ref={input}
          type="text"
          role="combobox"
          aria-label="Add a relationship"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={expanded ? listId : undefined}
          aria-activedescendant={activeDescendant}
          placeholder="Character name"
          autoComplete="off"
          value={value}
          onInput={onInput}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
        />
      )}
    </div>
  );
}

function RelationshipSuggestionList({
  campaign,
  matches,
  index,
  listId,
  panel,
  onSelect,
  onPointerDown,
}: {
  campaign: Campaign;
  matches: ReturnType<typeof matchingLinkTargets>;
  index: number;
  listId: string;
  panel: RefObject<HTMLDivElement | null>;
  onSelect: (id: string) => void;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <div
      ref={panel}
      id={listId}
      role="listbox"
      aria-label="Character matches"
      className="note-suggest context-menu panel drops-down"
    >
      {matches.length > 0 ? (
        matches.map((target, matchIndex) => (
          <RelationshipSuggestion
            key={target.id}
            campaign={campaign}
            target={target}
            active={matchIndex === index}
            id={`${listId}-${target.id}`}
            onSelect={() => {
              onSelect(target.id);
            }}
            onPointerDown={onPointerDown}
          />
        ))
      ) : (
        <p className="empty-inline note-suggest-empty">Nothing by that name.</p>
      )}
    </div>
  );
}

function RelationshipSuggestion({
  campaign,
  target,
  active,
  id,
  onSelect,
  onPointerDown,
}: {
  campaign: Campaign;
  target: ReturnType<typeof matchingLinkTargets>[number];
  active: boolean;
  id: string;
  onSelect: () => void;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      id={id}
      type="button"
      role="option"
      aria-selected={active}
      data-active={active || undefined}
      className="menu-item"
      onPointerDown={onPointerDown}
      onClick={onSelect}
    >
      <CampaignEntityGraphic campaign={campaign} kind="character" id={target.id} size={22} />
      <span className="menu-label">{target.label}</span>
      <span className="menu-shortcut">{target.detail}</span>
    </button>
  );
}

/** Everyone's relationships as a web: characters as nodes, each relationship an arrow with its label. Nodes drag. */
export function RelationshipsDialog({
  campaign,
  dialogRef,
}: {
  campaign: Campaign;
  dialogRef: RefObject<HTMLDialogElement | null>;
}) {
  const context = useCampaign();
  const readWeb = useCallback(() => {
    const people = listCharacters(campaign);
    const ids = people.map((p) => p.id);
    return {
      people: people.map((p) => ({ id: p.id, name: p.name, kind: p.kind })),
      edges: relationshipWeb(campaign.characters, ids),
    };
  }, [campaign]);
  const { people, edges } = useQuery(campaign.characters, readWeb);
  // Only characters in a relationship, unless there are none yet.
  const shown = useMemo(() => {
    const linked = new Set(edges.flatMap((e) => [e.from, e.to]));
    return people.filter((p) => linked.has(p.id));
  }, [people, edges]);
  return (
    <Dialog dialogRef={dialogRef} title="Relationships">
      {shown.length > 0 ? (
        <RelationshipWeb
          people={shown}
          edges={edges}
          onOpenCharacter={(id) => {
            context.links.openCharacter(id);
          }}
        />
      ) : (
        <p className="empty">No relationships yet. Add them from a character’s sheet.</p>
      )}
    </Dialog>
  );
}
