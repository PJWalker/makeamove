import type { RefObject } from "react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  canEdit,
  getCharacter,
  listCharacters,
  selectCharacter,
  systemOf,
} from "../features/characters/api";
import {
  layoutWeb,
  relationshipNotes,
  relationshipsOf,
  relationshipWeb,
  removeRelationship,
  setRelationship,
  setRelationshipDepth,
  type NodePosition,
} from "../features/characters/relationships";
import type { CharacterView } from "../features/characters/types";
import type { Campaign } from "../campaign/campaign";
import { useY } from "../ui/useY";
import { Button } from "../ui/Button";
import { IconDelete, IconExpand } from "../ui/icons";
import { Dialog } from "../workspace/Dialog";
import { CharacterText } from "../workspace/CharacterText";
import { showPanel } from "../workspace/panelLayout";
import { dialogRequest } from "../workspace/canvasState";
import { characterLinkTargets, matchingLinkTargets } from "../features/notes/targets";
import { useMenuOverlay } from "../ui/menuOverlay";
import { CampaignEntityGraphic } from "../workspace/EntityGraphic";
import { registerEntityDrop } from "../workspace/entityDrag";
import { extensionOf } from "../systems/extensions";

/*
 * Relationships (M9): a section on every character sheet listing how this
 * character sees others, each with notes; and a web of everyone's, in a
 * window anyone can open (campaign menu, palette, Characters panel).
 */

/** The Relationships section of a sheet. */
export function RelationshipsSection({ campaign, c }: { campaign: Campaign; c: CharacterView }) {
  const editable = canEdit(campaign, c);
  const system = systemOf(campaign);
  const depth = system.relationshipDepth;
  const tracksDepth = !!depth;
  const Extra = extensionOf(system).relationshipsExtra;
  const json = useY(campaign.characters, () =>
    JSON.stringify(relationshipsOf(campaign.characters, c.id)),
  );
  const rels = useMemo(
    () => JSON.parse(json) as { to: string; label: string; depth?: number }[],
    [json],
  );
  const peopleJson = useY(campaign.characters, () =>
    JSON.stringify(characterLinkTargets(campaign)),
  );
  const people = useMemo(
    () => JSON.parse(peopleJson) as ReturnType<typeof characterLinkTargets>,
    [peopleJson],
  );
  const others = useMemo(
    () =>
      people.filter(
        (other) => other.id !== c.id && !rels.some((relationship) => relationship.to === other.id),
      ),
    [people, c.id, rels],
  );
  const [adding, setAdding] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [active, setActive] = useState(0);
  const section = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const listId = useId();
  const matches = matchingLinkTargets(others, adding.replace(/^@/, ""));
  const expanded = editable && suggesting && adding.trim().length > 0;
  const index = Math.min(active, Math.max(0, matches.length - 1));
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
      setRelationship(campaign.characters, c.id, to, "");
      setAdding("");
      setSuggesting(false);
      setOpen(null);
      return true;
    },
    [campaign, c.id],
  );

  useEffect(() => {
    const element = section.current;
    if (!element || !editable) return;
    return registerEntityDrop(
      element,
      (entity) =>
        entity.link?.kind === "character" && others.some((other) => other.id === entity.link?.id),
      (entity) => {
        return entity.link ? add(entity.link.id) : false;
      },
    );
  }, [editable, others, add]);

  useMenuOverlay({
    open: expanded,
    ref: panel,
    anchor: input,
    onDismiss: () => setSuggesting(false),
  });

  return (
    <section ref={section} className="form-section sheet-section" aria-label="Relationships">
      <header className="sheet-section-header">
        <h3 className="sheet-heading">Relationships</h3>
        <Button variant="ghost" onClick={() => openRelationshipWeb()}>
          Web
        </Button>
      </header>
      {rels.length > 0 && (
        <ul className="relationships">
          {rels.map((r) => {
            const other = getCharacter(campaign, r.to);
            if (!other) return null;
            const expanded = open === r.to;
            return (
              <li key={r.to} className="relationship">
                <div className={`relationship-row${tracksDepth ? " has-depth" : ""}`}>
                  <button
                    type="button"
                    className="relationship-name"
                    onClick={() => selectCharacter(campaign, other.id)}
                  >
                    {other.name}
                  </button>
                  <input
                    aria-label={`How ${c.name} sees ${other.name}`}
                    placeholder="Trusts, owes, fears…"
                    value={r.label}
                    disabled={!editable}
                    onChange={(e) =>
                      setRelationship(campaign.characters, c.id, r.to, e.currentTarget.value.trim())
                    }
                  />
                  {depth && (
                    <label className="relationship-depth">
                      {depth.label}
                      <input
                        type="number"
                        min={0}
                        max={depth.max}
                        step={1}
                        value={r.depth ?? 0}
                        disabled={!editable}
                        aria-label={`${depth.label} with ${other.name}`}
                        onChange={(event) =>
                          setRelationshipDepth(
                            campaign.characters,
                            c.id,
                            r.to,
                            Number(event.currentTarget.value),
                            depth.max,
                          )
                        }
                      />
                    </label>
                  )}
                  <Button
                    variant="icon"
                    label={expanded ? "Hide notes" : "Notes"}
                    pressed={expanded}
                    onClick={() => setOpen(expanded ? null : r.to)}
                  >
                    <IconExpand />
                  </Button>
                  {editable && (
                    <Button
                      variant="icon"
                      label="Remove"
                      onClick={() => removeRelationship(campaign.characters, c.id, r.to)}
                    >
                      <IconDelete />
                    </Button>
                  )}
                </div>
                {expanded && (
                  <CharacterText
                    campaign={campaign}
                    c={c}
                    field={relationshipNotes(r.to)}
                    label="Notes"
                    editable={editable}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {Extra && <Extra campaign={campaign} c={c} editable={editable} />}
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
            aria-activedescendant={
              expanded && matches[index] ? `${listId}-${matches[index].id}` : undefined
            }
            placeholder="Character name"
            autoComplete="off"
            value={adding}
            onInput={(event) => {
              setAdding(event.currentTarget.value);
              setActive(0);
              setSuggesting(true);
            }}
            onFocus={() => setSuggesting(adding.trim().length > 0)}
            onBlur={() => setSuggesting(false)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && expanded) {
                event.preventDefault();
                event.stopPropagation();
                setSuggesting(false);
              } else if (
                expanded &&
                matches.length &&
                (event.key === "ArrowDown" || event.key === "ArrowUp")
              ) {
                event.preventDefault();
                setActive(
                  (index + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length,
                );
              } else if (
                expanded &&
                matches[index] &&
                (event.key === "Enter" || event.key === "Tab")
              ) {
                if (event.key === "Enter") event.preventDefault();
                add(matches[index].id);
              }
            }}
          />
        )}
      </div>
      {expanded &&
        createPortal(
          <div
            ref={panel}
            id={listId}
            role="listbox"
            aria-label="Character matches"
            className="note-suggest context-menu panel drops-down"
          >
            {matches.length ? (
              matches.map((target, matchIndex) => (
                <button
                  key={target.id}
                  id={`${listId}-${target.id}`}
                  type="button"
                  role="option"
                  aria-selected={matchIndex === index}
                  data-active={matchIndex === index || undefined}
                  className="menu-item"
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => add(target.id)}
                >
                  <CampaignEntityGraphic
                    campaign={campaign}
                    kind="character"
                    id={target.id}
                    size={22}
                  />
                  <span className="menu-label">{target.label}</span>
                  <span className="menu-shortcut">{target.detail}</span>
                </button>
              ))
            ) : (
              <p className="empty-inline note-suggest-empty">Nothing by that name.</p>
            )}
          </div>,
          document.body,
        )}
    </section>
  );
}

/** Open the web, from anywhere (the campaign's dialog host has it). */
export const openRelationshipWeb = () => (dialogRequest.value = "relationships");

const W = 640;
const H = 440;

/** Everyone's relationships as a web: characters as nodes, each relationship an arrow with its label. Nodes drag. */
export function RelationshipsDialog({
  campaign,
  dialogRef,
}: {
  campaign: Campaign;
  dialogRef: RefObject<HTMLDialogElement | null>;
}) {
  const json = useY(campaign.characters, () => {
    const people = listCharacters(campaign);
    const ids = people.map((p) => p.id);
    return JSON.stringify({
      people: people.map((p) => ({ id: p.id, name: p.name, kind: p.kind })),
      edges: relationshipWeb(campaign.characters, ids),
    });
  });
  const { people, edges } = useMemo(
    () =>
      JSON.parse(json) as {
        people: { id: string; name: string; kind: string }[];
        edges: { from: string; to: string; label: string }[];
      },
    [json],
  );
  // Only characters in a relationship, unless there are none yet.
  const shown = useMemo(() => {
    const linked = new Set(edges.flatMap((e) => [e.from, e.to]));
    return people.filter((p) => linked.has(p.id));
  }, [people, edges]);
  const [dragged, setDragged] = useState<Record<string, NodePosition>>({});
  const ids = useMemo(() => shown.map((p) => p.id), [shown]);
  const pos = useMemo(
    () => layoutWeb(ids, edges, { width: W, height: H, fixed: dragged }),
    [ids, edges, dragged],
  );
  const svgRef = useRef<SVGSVGElement>(null);

  const drag = (id: string, e: PointerEvent) => {
    const svg = svgRef.current;
    if (!svg || e.button !== 0) return;
    e.preventDefault();
    const box = svg.getBoundingClientRect();
    const at = (ev: PointerEvent) => ({
      x: ((ev.clientX - box.left) / box.width) * W,
      y: ((ev.clientY - box.top) / box.height) * H,
    });
    const start = at(e);
    let moved = false;
    const move = (ev: PointerEvent) => {
      const p = at(ev);
      if (!moved && Math.hypot(p.x - start.x, p.y - start.y) < 4) return;
      moved = true;
      setDragged({ ...dragged, [id]: p });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      // A click opens the character's sheet.
      if (!moved) {
        selectCharacter(campaign, id);
        showPanel("characters");
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <Dialog dialogRef={dialogRef} title="Relationships">
      {shown.length ? (
        <svg
          ref={svgRef}
          className="relationship-web"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Relationships between characters"
        >
          <defs>
            <marker
              id="rel-arrow"
              viewBox="0 0 10 10"
              refX="10"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 z" className="relationship-arrowhead" />
            </marker>
          </defs>
          {edges.map((e) => {
            const a = pos[e.from];
            const b = pos[e.to];
            if (!a || !b) return null;
            // Two-way relationships bow apart so both labels read.
            const both = edges.some((x) => x.from === e.to && x.to === e.from);
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const d = Math.max(1, Math.hypot(dx, dy));
            const nx = -dy / d;
            const ny = dx / d;
            const bow = both ? 26 : 0;
            const mx = (a.x + b.x) / 2 + nx * bow;
            const my = (a.y + b.y) / 2 + ny * bow;
            // Stop short of the node's circle.
            const end = {
              x: b.x - (dx / d) * NODE_R,
              y: b.y - (dy / d) * NODE_R,
            };
            const start = {
              x: a.x + (dx / d) * NODE_R,
              y: a.y + (dy / d) * NODE_R,
            };
            return (
              <g key={`${e.from}>${e.to}`}>
                <path
                  className="relationship-edge"
                  d={`M${start.x},${start.y} Q${mx},${my} ${end.x},${end.y}`}
                  markerEnd="url(#rel-arrow)"
                />
                {e.label && (
                  <text
                    className="relationship-label"
                    x={((start.x + end.x) / 2) * 0.5 + mx * 0.5}
                    y={((start.y + end.y) / 2) * 0.5 + my * 0.5 - 4}
                    textAnchor="middle"
                  >
                    {e.label}
                  </text>
                )}
              </g>
            );
          })}
          {shown.map((p) => {
            const at = pos[p.id];
            if (!at) return null;
            return (
              <g
                key={p.id}
                className="relationship-node"
                data-npc={p.kind === "npc" || undefined}
                transform={`translate(${at.x},${at.y})`}
                onPointerDown={(e) => drag(p.id, e as unknown as PointerEvent)}
              >
                <circle r={NODE_R} />
                <text className="relationship-initial" textAnchor="middle" dy="0.35em">
                  {p.name.trim()[0]?.toUpperCase()}
                </text>
                <text className="relationship-node-name" textAnchor="middle" y={NODE_R + 14}>
                  {p.name}
                </text>
              </g>
            );
          })}
        </svg>
      ) : (
        <p className="empty">No relationships yet. Add them from a character’s sheet.</p>
      )}
    </Dialog>
  );
}

const NODE_R = 20;
