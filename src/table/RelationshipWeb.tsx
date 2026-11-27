import { useMemo, useRef, useState } from "react";
import {
  layoutWeb
  
  
} from "../features/characters/relationships";
import type {NodePosition, RelationshipEdge} from "../features/characters/relationships";

const WIDTH = 640;
const HEIGHT = 440;
const NODE_RADIUS = 20;

interface RelationshipPerson { id: string; name: string; kind: string }

export function RelationshipWeb({
  people,
  edges,
  onOpenCharacter,
}: {
  people: RelationshipPerson[];
  edges: RelationshipEdge[];
  onOpenCharacter: (id: string) => void;
}) {
  const [dragged, setDragged] = useState<Record<string, NodePosition>>({});
  const ids = useMemo(() => people.map((person) => person.id), [people]);
  const positions = useMemo(
    () => layoutWeb(ids, edges, { width: WIDTH, height: HEIGHT, fixed: dragged }),
    [ids, edges, dragged],
  );
  const svgReference = useRef<SVGSVGElement>(null);

  const drag = (id: string, event: PointerEvent) => {
    const svg = svgReference.current;
    if (!svg || event.button !== 0) return;
    event.preventDefault();
    const box = svg.getBoundingClientRect();
    const positionAt = (pointer: PointerEvent) => ({
      x: ((pointer.clientX - box.left) / box.width) * WIDTH,
      y: ((pointer.clientY - box.top) / box.height) * HEIGHT,
    });
    const start = positionAt(event);
    let moved = false;
    const move = (pointer: PointerEvent) => {
      const position = positionAt(pointer);
      if (!moved && Math.hypot(position.x - start.x, position.y - start.y) < 4) return;
      moved = true;
      setDragged((current) => ({ ...current, [id]: position }));
    };
    const up = () => {
      globalThis.removeEventListener("pointermove", move);
      globalThis.removeEventListener("pointerup", up);
      if (!moved) onOpenCharacter(id);
    };
    globalThis.addEventListener("pointermove", move);
    globalThis.addEventListener("pointerup", up);
  };

  return (
    <svg
      ref={svgReference}
      className="relationship-web"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
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
      {edges.map((edge) => {
        const from = positions[edge.from];
        const to = positions[edge.to];
        if (!from || !to) return null;
        const bidirectional = edges.some(
          (other) => other.from === edge.to && other.to === edge.from,
        );
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const normalX = -dy / distance;
        const normalY = dx / distance;
        const bow = bidirectional ? 26 : 0;
        const middleX = (from.x + to.x) / 2 + normalX * bow;
        const middleY = (from.y + to.y) / 2 + normalY * bow;
        const start = {
          x: from.x + (dx / distance) * NODE_RADIUS,
          y: from.y + (dy / distance) * NODE_RADIUS,
        };
        const end = {
          x: to.x - (dx / distance) * NODE_RADIUS,
          y: to.y - (dy / distance) * NODE_RADIUS,
        };
        return (
          <g key={`${edge.from}>${edge.to}`}>
            <path
              className="relationship-edge"
              d={`M${start.x},${start.y} Q${middleX},${middleY} ${end.x},${end.y}`}
              markerEnd="url(#rel-arrow)"
            />
            {edge.label && (
              <text
                className="relationship-label"
                x={(start.x + end.x) / 4 + middleX / 2}
                y={(start.y + end.y) / 4 + middleY / 2 - 4}
                textAnchor="middle"
              >
                {edge.label}
              </text>
            )}
          </g>
        );
      })}
      {people.map((person) => {
        const position = positions[person.id];
        if (!position) return null;
        return (
          <g
            key={person.id}
            className="relationship-node"
            data-npc={person.kind === "npc" || undefined}
            transform={`translate(${position.x},${position.y})`}
            onPointerDown={(event) => { drag(person.id, event as unknown as PointerEvent); }}
          >
            <circle r={NODE_RADIUS} />
            <text className="relationship-initial" textAnchor="middle" dy="0.35em">
              {person.name.trim()[0]?.toUpperCase()}
            </text>
            <text className="relationship-node-name" textAnchor="middle" y={NODE_RADIUS + 14}>
              {person.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
