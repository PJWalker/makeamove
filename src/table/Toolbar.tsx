import type {
  PointerEvent as ReactPointerEvent,
  MouseEvent as ReactMouseEvent,
  RefObject,
} from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
// oxlint-disable-next-line react-doctor/no-flush-sync -- View transitions need the rendered options row in their capture callback.
import { flushSync } from "react-dom";
import type { Store } from "../lib/store";
import { startReorder } from "../ui/reorder";
import { scrollSideways } from "../ui/wheel";
import { createPortal } from "react-dom";
import { type LightToolMode, PEN_WIDTH_RANGE, type SelectKind, type ToolId } from "../scene/tools";
import { AREA_COLOURS, SHAPES, type ShapeKind } from "../scene/types";
import { Button } from "../ui/Button";
import { ColourPicker } from "../ui/ColourPicker";
import { Segmented, ToggleGroup } from "../ui/Segmented";
import {
  IconDraw,
  IconEffects,
  IconLight,
  IconMap,
  IconMenu,
  IconShapes,
  IconText,
  IconToken,
  IconWall,
  type Icon,
} from "../ui/icons";
import { TOOLS } from "../workspace/tools";
import { ContextMenu } from "../ui/ContextMenu";
import { useQuery } from "../ui/useQuery";
import { withTransition } from "../ui/transition";
import { tether } from "../ui/anchor";
import { EFFECT_OPTIONS, EffectSightToggles } from "./effectOptions";
import { useCampaign } from "../workspace/campaignContext";
import { selectTool } from "../workspace/commands/core";
import { menuFor } from "../workspace/commands/views";

/** Tools in the player's order; any not mentioned keep their default place after the others. */
function inOrder(tools: typeof TOOLS, order: ToolId[]) {
  const rank = (id: ToolId) =>
    order.includes(id) ? order.indexOf(id) : order.length + TOOLS.findIndex((t) => t.id === id);
  return [...tools].sort((a, b) => rank(a.id) - rank(b.id));
}

/** The tools with an options row, by which row: the pen's tools share one. */
const OPTIONS_ROW: Partial<Record<ToolId, "select" | "pen" | "light" | "effect">> = {
  select: "select",
  draw: "pen",
  shape: "pen",
  text: "pen",
  light: "light",
  effect: "effect",
};

/**
 * The active tool, shown with a view transition: a tool's options row grows
 * out of its button, shrinks back into it, and slides from one tool's row to
 * the next (the row is named `tool-options` under `.vt-tool` in Toolbar.css). The button
 * itself stays put; only the row's box moves.
 */
function useShownTool(activeTool: Store<ToolId>, strip: RefObject<HTMLElement | null>): ToolId {
  const [tool, setTool] = useState(activeTool.value);
  const shown = useRef(tool);
  useEffect(
    () =>
      activeTool.subscribe(() => {
        const prev = shown.current;
        const next = activeTool.value;
        if (prev === next) return;
        shown.current = next;
        const show = () => flushSync(() => setTool(next));
        if (!OPTIONS_ROW[prev] && !OPTIONS_ROW[next]) return show();
        const button = (id: ToolId) =>
          strip.current?.querySelector<HTMLElement>(`[data-tool="${id}"]`) ?? null;
        // Without a row on one side, the row grows from or shrinks into its tool's button.
        const growing = !OPTIONS_ROW[prev];
        const shrinking = !OPTIONS_ROW[next];
        void withTransition(show, {
          rootClass: ["vt-tool", ...(growing ? ["vt-tool-in"] : shrinking ? ["vt-tool-out"] : [])],
          home: growing ? button(next) : shrinking ? button(prev) : null,
        });
      }),
    [activeTool, strip],
  );
  return tool;
}

export function Toolbar({ isGm }: { isGm: boolean }) {
  const ctx = useCampaign();
  const order = useQuery(ctx.tools.toolOrder);
  const strip = useRef<HTMLElement>(null);
  const tool = useShownTool(ctx.tools.activeTool, strip);
  // The options row sits under its tool (Toolbar.css), tethered so it shares the
  // button with the tool's tooltip, which anchors to it too.
  const optionsRow = useRef<HTMLFieldSetElement>(null);
  useLayoutEffect(() => {
    const button = strip.current?.querySelector(`[data-tool="${tool}"]`);
    return optionsRow.current && button ? tether(optionsRow.current, button) : undefined;
  }, [tool]);
  const tools = useMemo(
    () =>
      inOrder(
        TOOLS.filter((t) => ctx.commands.permits(selectTool, { tool: t.id }) === true),
        order,
      ),
    [ctx, order],
  );

  function dragTool(id: ToolId, e: ReactPointerEvent) {
    const bar = (e.currentTarget as HTMLElement).closest<HTMLElement>(".toolbar")!;
    startReorder({
      event: e,
      axis: "x",
      container: bar,
      items: () => [...bar.querySelectorAll<HTMLElement>("[data-tool]")],
      onDrop: (index) => {
        const ids = tools.map((t) => t.id).filter((t) => t !== id);
        ids.splice(index, 0, id);
        // Hidden (GM-only) tools keep their place among the rest.
        const ordered = new Set(ids);
        const hidden = TOOLS.map((t) => t.id).filter((t) => !ordered.has(t));
        ctx.tools.toolOrder.set([...ids, ...hidden]);
      },
    });
  }

  return (
    <>
      <nav
        ref={strip}
        className="dock-strip toolbar strip across dock-top"
        aria-label="Canvas tools"
        onWheel={scrollSideways}
      >
        <CampaignMenu />
        {tools.map(({ id, label, key, Icon }) => (
          <Button
            key={id}
            variant="icon"
            label={`${label} (${key})`}
            pressed={tool === id}
            data-tool={id}
            onPointerDown={(e) => dragTool(id, e)}
            onClick={() => ctx.execute(selectTool, { tool: id })}
          >
            <Icon size={22} />
          </Button>
        ))}
      </nav>
      {OPTIONS_ROW[tool] === "select" && <SelectOptions isGm={isGm} rowRef={optionsRow} />}
      {OPTIONS_ROW[tool] === "pen" && <PenOptions tool={tool} rowRef={optionsRow} />}
      {OPTIONS_ROW[tool] === "light" && <LightOptions rowRef={optionsRow} />}
      {OPTIONS_ROW[tool] === "effect" && <EffectOptions rowRef={optionsRow} />}
    </>
  );
}

/**
 * The campaign menu, at the start of the tool strip: settings, help and the
 * way back to the campaign list. Opens on the press, like every menu, so
 * press, move to an item and release chooses it.
 */
function CampaignMenu() {
  const ctx = useCampaign();
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    press?: { x: number; y: number };
  } | null>(null);
  // Re-read as panels open and close, so their ticks are current.
  useQuery(ctx.panels.layout);
  useQuery(ctx.panels.unavailablePanels);
  const items = menuFor(ctx, { kind: "campaign" });
  const openBelow = (el: HTMLElement, press?: { x: number; y: number }) => {
    const r = el.getBoundingClientRect();
    setMenu({ x: r.left, y: r.bottom + 6, ...(press ? { press } : {}) });
  };
  return (
    <>
      <Button
        variant="icon"
        label="Campaign menu"
        className="toolbar-menu"
        pressed={!!menu}
        aria-haspopup="menu"
        aria-expanded={!!menu}
        onPointerDown={(e: ReactPointerEvent) => {
          if (e.button !== 0) return;
          if (menu) {
            setMenu(null);
            return;
          }
          openBelow(e.currentTarget as HTMLElement, {
            x: e.clientX,
            y: e.clientY,
          });
        }}
        // From the keyboard: Enter or Space.
        onClick={(e: ReactMouseEvent) => {
          if (e.detail === 0 && !menu) openBelow(e.currentTarget as HTMLElement);
        }}
      >
        <IconMenu size={22} />
      </Button>
      {/* Out of the strip, which would clip it. */}
      {menu &&
        createPortal(
          <ContextMenu
            {...menu}
            items={items}
            label="Campaign menu"
            onClose={() => setMenu(null)}
          />,
          document.body,
        )}
    </>
  );
}

/**
 * The pen's colour, width and layer, beside the tool strip. The Shapes tool
 * has the shape to draw and its outline and fill instead of the pen's colour.
 */
function PenOptions({
  tool,
  rowRef,
}: {
  tool: ToolId;
  rowRef: RefObject<HTMLFieldSetElement | null>;
}) {
  const ctx = useCampaign();
  const { colour, width, layer } = useQuery(ctx.tools.pen);
  const shape = useQuery(ctx.tools.shapeTool);
  const paint = useQuery(ctx.tools.shapePaint);
  return (
    <fieldset ref={rowRef} className="pen-options" aria-label="Pen">
      {tool === "shape" ? (
        <>
          <Segmented
            label="Shape"
            value={shape}
            options={SHAPE_OPTIONS}
            onChange={(shape) => ctx.tools.shapeTool.set(shape)}
          />
          <ColourPicker
            label="Outline Colour"
            alpha
            value={paint.stroke}
            onChange={(stroke) => ctx.tools.setShapePaint({ stroke })}
          />
          <ColourPicker
            label="Fill Colour"
            alpha
            value={paint.fill}
            onChange={(fill) => ctx.tools.setShapePaint({ fill })}
          />
        </>
      ) : (
        <ColourPicker
          label="Pen Colour"
          alpha
          value={colour}
          onChange={(c) => ctx.tools.setPen({ colour: c })}
        />
      )}
      {tool === "draw" && (
        <label className="pen-width" data-tip="Pen width">
          <span className="pen-width-preview" aria-hidden>
            <span
              className="pen-dot"
              style={{ width: `${width}px`, height: `${width}px`, background: colour }}
            />
          </span>
          <input
            type="range"
            min={PEN_WIDTH_RANGE.min}
            max={PEN_WIDTH_RANGE.max}
            value={width}
            aria-label="Pen width"
            onChange={(e) => ctx.tools.setPen({ width: Number(e.currentTarget.value) })}
          />
        </label>
      )}
      <Segmented
        label="Layer"
        value={layer}
        options={[
          { id: "over", label: "Over Tokens" },
          { id: "under", label: "Under Tokens" },
        ]}
        onChange={(l) => ctx.tools.setPen({ layer: l })}
      />
    </fieldset>
  );
}

/** The sorts of things the Select tool can pick, each with the icon of the tool that makes it. */
const SELECT_KINDS: { id: SelectKind; label: string; Icon: Icon; gmOnly?: boolean }[] = [
  { id: "token", label: "Tokens", Icon: IconToken },
  { id: "map", label: "Maps", Icon: IconMap },
  { id: "drawing", label: "Drawings", Icon: IconDraw },
  { id: "shape", label: "Shapes", Icon: IconShapes },
  { id: "text", label: "Text", Icon: IconText },
  { id: "wall", label: "Walls", Icon: IconWall, gmOnly: true },
  { id: "light", label: "Lights", Icon: IconLight, gmOnly: true },
  { id: "effect", label: "Effects", Icon: IconEffects, gmOnly: true },
];

/** Which sorts of things the Select tool picks. */
function SelectOptions({
  isGm,
  rowRef,
}: {
  isGm: boolean;
  rowRef: RefObject<HTMLFieldSetElement | null>;
}) {
  const ctx = useCampaign();
  const kinds = useQuery(ctx.tools.selectable);
  const options = SELECT_KINDS.filter((k) => isGm || !k.gmOnly);
  const shown = new Set(options.map((k) => k.id));
  return (
    <fieldset ref={rowRef} className="pen-options" aria-label="Select">
      <ToggleGroup
        label="Selects"
        value={kinds}
        options={options.map(({ id, label, Icon }) => ({
          id,
          label,
          icon: <Icon size={22} />,
        }))}
        // Sorts not offered here (the GM's, for a player) stay as they were.
        onChange={(next) =>
          ctx.tools.selectable.set([...next, ...kinds.filter((k) => !shown.has(k))])
        }
      />
    </fieldset>
  );
}

const LIGHT_MODES: { id: LightToolMode; label: string }[] = [
  { id: "lamp", label: "Lamp" },
  { id: "light", label: "Area of light" },
  { id: "dark", label: "Area of dark" },
];

/** What the Lights tool places, beside the tool strip. */
function LightOptions({ rowRef }: { rowRef: RefObject<HTMLFieldSetElement | null> }) {
  const ctx = useCampaign();
  const mode = useQuery(ctx.tools.lightTool);
  return (
    <fieldset ref={rowRef} className="pen-options" aria-label="Lights">
      <Segmented
        label="Place"
        value={mode}
        options={LIGHT_MODES.map((m) => ({ ...m, icon: <LightGlyph mode={m.id} /> }))}
        onChange={(mode) => ctx.tools.lightTool.set(mode)}
      />
    </fieldset>
  );
}

/** What the Effects tool puts down: the effect, its colour, light and sight, and the shape of its zone. */
function EffectOptions({ rowRef }: { rowRef: RefObject<HTMLFieldSetElement | null> }) {
  const ctx = useCampaign();
  const { effect, colour, glow, obscures, shape } = useQuery(ctx.tools.effectTool);
  return (
    <fieldset ref={rowRef} className="pen-options" aria-label="Effects">
      <Segmented
        label="Effect"
        value={effect}
        options={EFFECT_OPTIONS}
        onChange={(effect) => ctx.tools.setEffectTool({ effect })}
      />
      <ColourPicker
        label="Effect Colour"
        alpha
        value={colour}
        onChange={(colour) => ctx.tools.setEffectTool({ colour })}
      />
      <EffectSightToggles
        value={{ glow, obscures }}
        onChange={(sight) => ctx.tools.setEffectTool(sight)}
      />
      <Segmented
        label="Shape"
        value={shape}
        options={SHAPE_OPTIONS}
        onChange={(shape) => ctx.tools.setEffectTool({ shape })}
      />
    </fieldset>
  );
}

/**
 * A small picture of what the Lights tool places, for its button. Drawn in its
 * own colours, or the selected segment's ink when chosen (--glyph-ink, Segmented.css).
 */
function LightGlyph({ mode }: { mode: LightToolMode }) {
  const ink = (colour: string) => `var(--glyph-ink, ${colour})`;
  if (mode === "lamp") {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <circle
          cx="9"
          cy="9"
          r="7.5"
          style={{ fill: "none", stroke: ink("#ffd27a") }}
          strokeOpacity="0.5"
          strokeWidth="1.5"
        />
        <circle cx="9" cy="9" r="3.5" style={{ fill: ink("#ffd27a") }} />
      </svg>
    );
  }
  const colour = AREA_COLOURS[mode];
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <polygon
        points="2,5 11,2 16,10 9,16 3,12"
        style={{ fill: ink(mode === "dark" ? "#000" : colour), stroke: ink(colour) }}
        fillOpacity={mode === "dark" ? 0.6 : 0.35}
        strokeWidth="1.5"
      />
    </svg>
  );
}

/** The shapes, as Segmented options with their pictures. */
const SHAPE_OPTIONS = SHAPES.map((s) => ({
  id: s.id,
  label: s.label,
  icon: <ShapeGlyph shape={s.id} />,
}));

/**
 * A small picture of a shape for its button, in the segment's own ink so it
 * stands out whether chosen or not, whatever the shape's paint.
 */
function ShapeGlyph({ shape }: { shape: ShapeKind }) {
  const common = {
    fill: "currentColor",
    fillOpacity: 0.3,
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinejoin: "round",
  } as const;
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      {shape === "rect" && <rect x="3" y="3" width="12" height="12" {...common} />}
      {shape === "circle" && <circle cx="9" cy="9" r="6.5" {...common} />}
      {shape === "line" && <rect x="1" y="7" width="16" height="4" {...common} />}
      {shape === "cone" && <polygon points="2,9 16,2 16,16" {...common} />}
      {shape === "polygon" && <polygon points="2,6 9,2 16,6 14,15 5,16" {...common} />}
    </svg>
  );
}
