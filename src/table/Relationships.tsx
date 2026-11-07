import { useSignal } from "@preact/signals-react";
import type { RefObject } from "react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useMemo, useRef } from "react";
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
  advanceBond,
  bondsFor,
  forgeBond,
  setRelationship,
  setRelationshipDepth,
  type NodePosition,
} from "../features/characters/relationships";
import type { CharacterView } from "../features/characters/types";
import type { Campaign } from "../campaign/campaign";
import { useY } from "../ui/useY";
import { Button } from "../ui/Button";
import { IconDelete, IconExpand } from "../ui/icons";
import { Dialog } from "./CampaignDialogs";
import { CharacterText } from "./CharacterText";
import { showPanel } from "./panelLayout";
import { dialogRequest } from "./canvasState";
import { characterLinkTargets, matchingLinkTargets } from "../features/notes/targets";
import { useMenuOverlay } from "../ui/menuOverlay";
import { CampaignEntityGraphic } from "./EntityGraphic";
import { registerEntityDrop } from "./entityDrag";
import { BONDS } from "../systems/dungeon-world-2/bonds";

/*
 * Relationships (M9): a section on every character sheet listing how this
 * character sees others, each with notes; and a web of everyone's, in a
 * window anyone can open (campaign menu, palette, Characters panel).
 */

/** The Relationships section of a sheet. */
export function RelationshipsSection({ campaign, c }: { campaign: Campaign; c: CharacterView }) {
  const editable = canEdit(campaign, c);
  const tracksDepth = systemOf(campaign).id === "dungeon-world-2";
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
  const depthWebJson = useY(campaign.characters, () =>
    JSON.stringify(
      relationshipWeb(
        campaign.characters,
        listCharacters(campaign).map((person) => person.id),
      ),
    ),
  );
  const depthWeb = useMemo(
    () => JSON.parse(depthWebJson) as ReturnType<typeof relationshipWeb>,
    [depthWebJson],
  );
  const bondsJson = useY(campaign.systemData, () =>
    JSON.stringify(bondsFor(campaign.systemData, c.id)),
  );
  const bonds = useMemo(() => JSON.parse(bondsJson) as ReturnType<typeof bondsFor>, [bondsJson]);
  const eligibleBondmates = useMemo(
    () =>
      people.filter((person) => {
        const other = getCharacter(campaign, person.id);
        const ownDepth =
          depthWeb.find(
            (relationship) => relationship.from === c.id && relationship.to === person.id,
          )?.depth ?? 0;
        const theirDepth =
          depthWeb.find(
            (relationship) => relationship.from === person.id && relationship.to === c.id,
          )?.depth ?? 0;
        return person.id !== c.id && other?.kind === "pc" && ownDepth >= 3 && theirDepth >= 3;
      }),
    [campaign, people, depthWeb, c.id],
  );
  const others = useMemo(
    () =>
      people.filter(
        (other) => other.id !== c.id && !rels.some((relationship) => relationship.to === other.id),
      ),
    [people, c.id, rels],
  );
  const adding = useSignal("");
  const open = useSignal<string | null>(null);
  const suggesting = useSignal(false);
  const active = useSignal(0);
  const bondmateId = useSignal("");
  const bondType = useSignal("");
  const bondMoveId = useSignal("");
  const section = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const listId = useId();
  const matches = matchingLinkTargets(others, adding.value.replace(/^@/, ""));
  const expanded = editable && suggesting.value && adding.value.trim().length > 0;
  const index = Math.min(active.value, Math.max(0, matches.length - 1));
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
      adding.value = "";
      suggesting.value = false;
      open.value = null;
      return true;
    },
    [campaign, c.id, adding, open, suggesting],
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

  const bounds = input.current?.getBoundingClientRect();
  useMenuOverlay({
    open: expanded,
    ref: panel,
    anchor: bounds ? { left: bounds.left, top: bounds.top, bottom: bounds.bottom } : null,
    inside: [input.current],
    onDismiss: () => (suggesting.value = false),
    positionKey: `${adding.value}:${matches.map((match) => match.id).join(",")}`,
  });

  return (
    <section ref={section} className="form-section sheet-section" aria-label="Relationships">
      <h3 className="sheet-heading">Relationships</h3>{" "}
      <Button size="sm" variant="ghost" onClick={() => openRelationshipWeb()}>
        Web
      </Button>
      {rels.length > 0 && (
        <ul className="relationships">
          {rels.map((r) => {
            const other = getCharacter(campaign, r.to);
            if (!other) return null;
            const expanded = open.value === r.to;
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
                  {tracksDepth && (
                    <label className="relationship-depth">
                      Depth
                      <input
                        type="number"
                        min={0}
                        max={3}
                        step={1}
                        value={r.depth ?? 0}
                        disabled={!editable}
                        aria-label={`Depth with ${other.name}`}
                        onChange={(event) =>
                          setRelationshipDepth(
                            campaign.characters,
                            c.id,
                            r.to,
                            Number(event.currentTarget.value),
                          )
                        }
                      />
                    </label>
                  )}
                  <Button
                    variant="icon"
                    size="sm"
                    label={expanded ? "Hide notes" : "Notes"}
                    pressed={expanded}
                    onClick={() => (open.value = expanded ? null : r.to)}
                  >
                    <IconExpand />
                  </Button>
                  {editable && (
                    <Button
                      variant="icon"
                      size="sm"
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
      {tracksDepth && bonds.length > 0 && (
        <ul className="relationships" aria-label="Bonds">
          {bonds.map((bond) => {
            const partnerId = bond.first === c.id ? bond.second : bond.first;
            const partner = getCharacter(campaign, partnerId);
            const definition = BONDS.find((entry) => entry.id === bond.type);
            return (
              <li key={`${bond.first}:${bond.second}`} className="relationship">
                <div className="relationship-row">
                  <span className="relationship-name">{partner?.name ?? "Former PC"}</span>
                  <strong>{definition?.name ?? bond.type}</strong>
                </div>
                {definition && (
                  <details className="relationship-bond-rules">
                    <summary>Bond rules</summary>
                    <p>{definition.text}</p>
                    <ul aria-label={`${definition.name} moves`}>
                      {definition.moves.map((move) => (
                        <li key={move.id}>
                          {move.name}:{" "}
                          {move.starting
                            ? "Starting move"
                            : bond.advancedMoves.includes(move.id)
                              ? "Unlocked"
                              : "Locked"}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {tracksDepth &&
        editable &&
        eligibleBondmates.length > 0 &&
        (() => {
          const currentBond = bonds.find(
            (bond) =>
              (bond.first === c.id && bond.second === bondmateId.value) ||
              (bond.second === c.id && bond.first === bondmateId.value),
          );
          const reinforcing = currentBond?.type === bondType.value;
          const definition = BONDS.find((bond) => bond.id === bondType.value);
          const availableMoves = reinforcing
            ? (definition?.moves.slice(1) ?? []).filter(
                (move) => !currentBond.advancedMoves.includes(move.id),
              )
            : [];
          return (
            <div className="relationship-bond-controls">
              <label>
                Bondmate
                <select
                  value={bondmateId.value}
                  onChange={(event) => {
                    bondmateId.value = event.currentTarget.value;
                    bondMoveId.value = "";
                  }}
                >
                  <option value="">Choose a PC</option>
                  {eligibleBondmates.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Bond
                <select
                  aria-label="Bond type"
                  value={bondType.value}
                  onChange={(event) => {
                    bondType.value = event.currentTarget.value;
                    bondMoveId.value = "";
                  }}
                >
                  <option value="">Choose a Bond</option>
                  {BONDS.map((bond) => (
                    <option key={bond.id} value={bond.id}>
                      {bond.name}
                    </option>
                  ))}
                </select>
              </label>
              {reinforcing && availableMoves.length > 0 && (
                <label>
                  Advanced move
                  <select
                    value={bondMoveId.value}
                    onChange={(event) => (bondMoveId.value = event.currentTarget.value)}
                  >
                    <option value="">Choose a move</option>
                    {availableMoves.map((move) => (
                      <option key={move.id} value={move.id}>
                        {move.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {reinforcing && availableMoves.length === 0 && (
                <span className="muted">All advanced Bond moves are unlocked.</span>
              )}
              <Button
                size="sm"
                variant="secondary"
                disabled={
                  !bondmateId.value || !bondType.value || (reinforcing && !bondMoveId.value)
                }
                onClick={() => {
                  const changed = reinforcing
                    ? advanceBond(
                        campaign.systemData,
                        campaign.characters,
                        c.id,
                        bondmateId.value,
                        bondMoveId.value,
                      )
                    : forgeBond(
                        campaign.systemData,
                        campaign.characters,
                        c.id,
                        bondmateId.value,
                        bondType.value,
                      );
                  if (changed) {
                    bondmateId.value = "";
                    bondMoveId.value = "";
                  }
                }}
              >
                {reinforcing ? "Reinforce Bond" : "Forge Bond"}
              </Button>
            </div>
          );
        })()}
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
            value={adding.value}
            onInput={(event) => {
              adding.value = event.currentTarget.value;
              active.value = 0;
              suggesting.value = true;
            }}
            onFocus={() => (suggesting.value = adding.value.trim().length > 0)}
            onBlur={() => (suggesting.value = false)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && expanded) {
                event.preventDefault();
                event.stopPropagation();
                suggesting.value = false;
              } else if (
                expanded &&
                matches.length &&
                (event.key === "ArrowDown" || event.key === "ArrowUp")
              ) {
                event.preventDefault();
                active.value =
                  (index + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length;
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
            className="note-suggest context-menu panel"
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
  const dragged = useSignal<Record<string, NodePosition>>({});
  const ids = useMemo(() => shown.map((p) => p.id), [shown]);
  const pos = useMemo(
    () => layoutWeb(ids, edges, { width: W, height: H, fixed: dragged.value }),
    [ids, edges, dragged.value],
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
      dragged.value = { ...dragged.value, [id]: p };
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
