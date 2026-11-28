import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
// eslint-disable-next-line react-doctor/no-flush-sync -- View transitions need the rendered tool settings in their capture callback.
import { flushSync } from "react-dom";
import { createPortal } from "react-dom";
import type { Store } from "../lib/store";
import { startReorder } from "../ui/reorder";
import { scrollSideways } from "../ui/wheel";
import { PEN_LAYERS, PEN_WIDTH_RANGE, penLayerFor } from "../scene/tools";
import type { LightToolMode, SelectKind, ToolId } from "../scene/tools";
import { AREA_COLOURS } from "../scene/types";
import { Button } from "../ui/Button";
import { ColourPicker } from "../ui/ColourPicker";
import { Segmented, ToggleGroup } from "../ui/Segmented";
import {
  IconDraw,
  IconEffects,
  IconLight,
  IconMap,
  IconMapPin,
  IconMenu,
  IconObscure,
  IconShapes,
  IconText,
  IconToken,
  IconWall,
  PROMINENT_ICON_SIZE,
} from "../ui/icons";
import type { Icon } from "../ui/icons";
import { TOOLS } from "../workspace/tools";
import { ContextMenu } from "../ui/ContextMenu";
import type { MenuItem } from "../ui/ContextMenu";
import { useQuery } from "../ui/useQuery";
import { withTransition } from "../ui/transition";
import { useCampaign } from "../workspace/campaignContext";
import { selectTool } from "../workspace/commands/core";
import { menuFor } from "../workspace/commands/views";
import { EffectSightToggles } from "./effectOptions";
import { EFFECT_OPTIONS, FOG_FORCE_OPTIONS, SHAPE_OPTIONS } from "./effectOptionsData";
import { TextStyleFields } from "./TextStyleFields";
import { useDockStripLayout } from "./dockStrip";

function measureToolbar(toolbar: HTMLElement) {
  const strip = toolbar.querySelector<HTMLElement>(".toolbar-tools")!;
  const style = getComputedStyle(toolbar);
  const padding = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
  const optionsWidth = Number.parseFloat(style.getPropertyValue("--toolbar-options-width"));
  const optionsInset =
    Number.parseFloat(style.getPropertyValue("--space-3")) +
    Number.parseFloat(style.getPropertyValue("--space-2")) +
    1;
  return {
    width: strip.scrollWidth + padding + optionsWidth + optionsInset,
    elements: [strip],
  };
}

/** Tools in the player's order; any not mentioned keep their default place after the others. */
function inOrder(tools: typeof TOOLS, order: ToolId[]) {
  const rank = (id: ToolId) =>
    order.includes(id) ? order.indexOf(id) : order.length + TOOLS.findIndex((t) => t.id === id);
  return [...tools].sort((a, b) => rank(a.id) - rank(b.id));
}

const TOOL_OPTIONS: Partial<Record<ToolId, "effect" | "fog" | "light" | "pen" | "select">> = {
  select: "select",
  draw: "pen",
  shape: "pen",
  text: "pen",
  light: "light",
  effect: "effect",
  fog: "fog",
};

function useShownTool(activeTool: Store<ToolId>): ToolId {
  const [tool, setTool] = useState(activeTool.value);
  const shown = useRef(tool);
  useEffect(
    () =>
      activeTool.subscribe(() => {
        const previous = shown.current;
        const next = activeTool.value;
        if (previous === next) return;
        shown.current = next;
        const show = () => {
          flushSync(() => {
            setTool(next);
          });
        };
        if (!TOOL_OPTIONS[previous] && !TOOL_OPTIONS[next]) {
          show();
          return;
        }
        void withTransition(show, { rootClass: "vt-tool" });
      }),
    [activeTool],
  );
  return tool;
}

export function Toolbar({ isGm }: { isGm: boolean }) {
  const context = useCampaign();
  const order = useQuery(context.tools.toolOrder);
  const tool = useShownTool(context.tools.activeTool);
  const toolbarReference = useRef<HTMLDivElement>(null);
  useDockStripLayout(toolbarReference, "top", measureToolbar);
  const tools = useMemo(
    () =>
      inOrder(
        TOOLS.filter((t) => context.commands.permits(selectTool, { tool: t.id }) === true),
        order,
      ),
    [context, order],
  );

  function dragTool(id: ToolId, e: ReactPointerEvent) {
    const bar = (e.currentTarget as HTMLElement).closest<HTMLElement>(".toolbar-tools")!;
    startReorder({
      event: e,
      axis: "x",
      container: bar,
      items: () => [...bar.querySelectorAll<HTMLElement>("[data-tool]")],
      onDrop: (index) => {
        const ids = tools.flatMap((t) => (t.id === id ? [] : [t.id]));
        ids.splice(index, 0, id);
        // Hidden (GM-only) tools keep their place among the rest.
        const ordered = new Set(ids);
        const hidden = TOOLS.flatMap((t) => (ordered.has(t.id) ? [] : [t.id]));
        context.tools.toolOrder.set([...ids, ...hidden]);
      },
    });
  }

  return (
    <div ref={toolbarReference} className="dock-strip toolbar dock-top">
      <nav className="toolbar-tools" aria-label="Canvas tools" onWheel={scrollSideways}>
        <CampaignMenu />
        {tools.map(({ id, label, key, Icon }) => (
          <Button
            key={id}
            variant="icon"
            label={`${label} (${key})`}
            pressed={tool === id}
            data-tool={id}
            onPointerDown={(e) => {
              dragTool(id, e);
            }}
            onClick={() => context.execute(selectTool, { tool: id })}
          >
            <Icon size={PROMINENT_ICON_SIZE} />
          </Button>
        ))}
      </nav>
      <div className="toolbar-options">
        {TOOL_OPTIONS[tool] === "select" && <SelectOptions isGm={isGm} />}
        {TOOL_OPTIONS[tool] === "pen" && <PenOptions tool={tool} isGm={isGm} />}
        {TOOL_OPTIONS[tool] === "light" && <LightOptions />}
        {TOOL_OPTIONS[tool] === "effect" && <EffectOptions />}
        {TOOL_OPTIONS[tool] === "fog" && <FogOptions />}
      </div>
    </div>
  );
}

/**
 * The campaign menu, at the start of the tool strip: settings, help and the
 * way back to the campaign list. Opens on the press, like every menu, so
 * press, move to an item and release chooses it.
 */
function CampaignMenu() {
  const context = useCampaign();
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    items: MenuItem[];
    press?: { x: number; y: number };
  } | null>(null);
  // Built as it opens, like every menu, so its ticks show the table as it is now.
  const openBelow = (element: HTMLElement, press?: { x: number; y: number }) => {
    const r = element.getBoundingClientRect();
    setMenu({
      x: r.left,
      y: r.bottom + 6,
      items: menuFor(context, { kind: "campaign" }),
      ...(press ? { press } : {}),
    });
  };
  return (
    <>
      <Button
        variant="icon"
        label="Campaign Menu"
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
        <IconMenu size={PROMINENT_ICON_SIZE} />
      </Button>
      {/* Out of the strip, which would clip it. */}
      {menu &&
        createPortal(
          <ContextMenu
            {...menu}
            label="Campaign menu"
            onClose={() => {
              setMenu(null);
            }}
          />,
          document.body,
        )}
    </>
  );
}

/**
 * The pen's colour, width and layer, within the toolbar. The Shapes tool
 * has the shape to draw and its outline and fill instead of the pen's colour.
 */
function PenOptions({ tool, isGm }: { tool: ToolId; isGm: boolean }) {
  const context = useCampaign();
  const { colour, width, layer } = useQuery(context.tools.pen);
  const shape = useQuery(context.tools.shapeTool);
  const paint = useQuery(context.tools.shapePaint);
  const textStyle = useQuery(context.tools.textStyle);
  return (
    <fieldset className="tool-settings" aria-label="Pen">
      {tool === "shape" ? (
        <>
          <Segmented
            label="Shape"
            value={shape}
            options={SHAPE_OPTIONS}
            onChange={(shape) => {
              context.tools.shapeTool.set(shape);
            }}
          />
          <ColourPicker
            label="Outline Colour"
            alpha
            value={paint.stroke}
            onChange={(stroke) => {
              context.tools.setShapePaint({ stroke });
            }}
          />
          <ColourPicker
            label="Fill Colour"
            alpha
            value={paint.fill}
            onChange={(fill) => {
              context.tools.setShapePaint({ fill });
            }}
          />
        </>
      ) : (
        <ColourPicker
          label="Pen Colour"
          alpha
          value={colour}
          onChange={(c) => {
            context.tools.setPen({ colour: c });
          }}
        />
      )}
      {tool === "text" && (
        <TextStyleFields
          value={textStyle}
          onChange={(patch) => {
            context.tools.setTextStyle(patch);
          }}
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
            onChange={(e) => {
              context.tools.setPen({ width: Number(e.currentTarget.value) });
            }}
          />
        </label>
      )}
      <Segmented
        label="Layer"
        value={penLayerFor(layer, isGm)}
        options={PEN_LAYERS}
        onChange={(l) => {
          context.tools.setPen({ layer: l });
        }}
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
  { id: "pin", label: "Pins", Icon: IconMapPin },
  { id: "wall", label: "Walls", Icon: IconWall, gmOnly: true },
  { id: "light", label: "Lights", Icon: IconLight, gmOnly: true },
  { id: "effect", label: "Effects", Icon: IconEffects, gmOnly: true },
  { id: "fog", label: "Fog of War", Icon: IconObscure, gmOnly: true },
];

/** Which sorts of things the Select tool picks. */
function SelectOptions({ isGm }: { isGm: boolean }) {
  const context = useCampaign();
  const kinds = useQuery(context.tools.selectable);
  const options = SELECT_KINDS.filter((k) => isGm || !k.gmOnly);
  const shown = new Set(options.map((k) => k.id));
  return (
    <fieldset className="tool-settings" aria-label="Select">
      <ToggleGroup
        label="Selects"
        value={kinds}
        options={options.map(({ id, label, Icon }) => ({
          id,
          label,
          icon: <Icon size={22} />,
        }))}
        // Sorts not offered here (the GM's, for a player) stay as they were.
        onChange={(next) => {
          context.tools.selectable.set([...next, ...kinds.filter((k) => !shown.has(k))]);
        }}
      />
    </fieldset>
  );
}

const LIGHT_MODES: { id: LightToolMode; label: string }[] = [
  { id: "lamp", label: "Lamp" },
  { id: "light", label: "Area of light" },
  { id: "dark", label: "Area of dark" },
];

/** What the Lights tool places. */
function LightOptions() {
  const context = useCampaign();
  const mode = useQuery(context.tools.lightTool);
  return (
    <fieldset className="tool-settings" aria-label="Lights">
      <Segmented
        label="Place"
        value={mode}
        options={LIGHT_MODES.map((m) => ({ ...m, icon: <LightGlyph mode={m.id} /> }))}
        onChange={(mode) => {
          context.tools.lightTool.set(mode);
        }}
      />
    </fieldset>
  );
}

/** What the Effects tool puts down: the effect, its colour, light and sight, and the shape of its zone. */
function EffectOptions() {
  const context = useCampaign();
  const { effect, colour, glow, obscures, shape } = useQuery(context.tools.effectTool);
  return (
    <fieldset className="tool-settings" aria-label="Effects">
      <Segmented
        label="Effect"
        value={effect}
        options={EFFECT_OPTIONS}
        onChange={(effect) => {
          context.tools.setEffectTool({ effect });
        }}
      />
      <ColourPicker
        label="Effect Colour"
        alpha
        value={colour}
        onChange={(colour) => {
          context.tools.setEffectTool({ colour });
        }}
      />
      <EffectSightToggles
        value={{ glow, obscures }}
        onChange={(sight) => {
          context.tools.setEffectTool(sight);
        }}
      />
      <Segmented
        label="Shape"
        value={shape}
        options={SHAPE_OPTIONS}
        onChange={(shape) => {
          context.tools.setEffectTool({ shape });
        }}
      />
    </fieldset>
  );
}

/** What the Fog of War tool draws: a shape always revealed to players, or always hidden, and its shape. */
function FogOptions() {
  const context = useCampaign();
  const { force, shape } = useQuery(context.tools.fogTool);
  return (
    <fieldset className="tool-settings" aria-label="Fog of War">
      <Segmented
        label="Draw"
        value={force}
        options={FOG_FORCE_OPTIONS}
        onChange={(next) => {
          context.tools.setFogTool({ force: next });
        }}
      />
      <Segmented
        label="Shape"
        value={shape}
        options={SHAPE_OPTIONS}
        onChange={(next) => {
          context.tools.setFogTool({ shape: next });
        }}
      />
    </fieldset>
  );
}

const ink = (colour: string) => `var(--glyph-ink, ${colour})`;

/**
 * A small picture of what the Lights tool places, for its button. Drawn in its
 * own colours, or the selected segment's ink when chosen (--glyph-ink, Segmented.css).
 */
function LightGlyph({ mode }: { mode: LightToolMode }) {
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
