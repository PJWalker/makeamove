import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type SceneController from "../scene/controller";
import type { ElementPatch } from "../scene/sceneDoc";
import { bounds } from "../scene/geometry";
import { toScreen } from "../scene/camera";
import { HANDLE_SIZE, ROTATE_HANDLE_GAP } from "../scene/render/handles";
import { PEN_WIDTH_RANGE, PEN_LAYERS } from "../scene/tools";
import type { SmartShapes, PenLayer } from "../scene/tools";
import alignToGrid from "../scene/gridAlign";
import { drawingInk, nearShape, shapeElement, shapeName } from "../scene/smartShapes";
import { isPlainToken, sharedTextStyle } from "../scene/types";
import type { EffectKind, SceneElement, ShapeKind, TextStyle, FogForce } from "../scene/types";
import ColourPicker from "../ui/ColourPicker";
import Button from "../ui/Button";
import { Segmented } from "../ui/Segmented";
import { IconLock, IconReveal, IconSettings, IconUnlock } from "../ui/icons";
import type { Icon } from "../ui/icons";
import { useQuery } from "../ui/useQuery";
import { useCampaign } from "../workspace/campaignContext";
import ShapeGlyph from "./ShapeGlyph";
import TextStyleFields from "./TextStyleFields";
import { EFFECT_OPTIONS, FOG_FORCE_OPTIONS } from "./effectOptionsData";
import EffectSightToggles from "./effectOptions";
import { lightFields, wallFields } from "./visionFields";
import { PinTargetField } from "./PinPicker";
import TokenStats from "./TokenStats";
import DetectWallsFields from "./DetectWallsFields";
import AlignMapFields from "./AlignMapFields";
import "./SelectionBar.css";

/** Each shape's picture, as an icon for a button. */
const SHAPE_ICONS: Record<ShapeKind, Icon> = {
  rect: (properties) => <ShapeGlyph shape="rect" {...properties} />,
  circle: (properties) => <ShapeGlyph shape="circle" {...properties} />,
  line: (properties) => <ShapeGlyph shape="line" {...properties} />,
  cone: (properties) => <ShapeGlyph shape="cone" {...properties} />,
  polygon: (properties) => <ShapeGlyph shape="polygon" {...properties} />,
};

/** Screen px between the selection (and its rotate handle) and the bar. */
const GAP = ROTATE_HANDLE_GAP + HANDLE_SIZE;
/** Screen px the bar keeps from the edges of the scene's open space. */
const MARGIN = 8;

type Of<T extends SceneElement["type"]> = Extract<SceneElement, { type: T }>;
const every = <T extends SceneElement["type"]>(
  sel: readonly SceneElement[],
  ...types: T[]
): sel is readonly Of<T>[] => {
  const typeSet = new Set(types);
  return sel.every((element) => typeSet.has(element.type as T));
};

/**
 * The selection's properties, in a bar over it: whatever can be changed about
 * everything selected, each change applying as it's made. It keeps out of the
 * way while a press is under way, and follows the selection as the camera moves.
 */
function SelectionBar({
  controller,
  onTokenOptions,
}: {
  controller: SceneController;
  /** Open the full options for a token, growing out of `from`. */
  onTokenOptions: (id: string, from: Element) => void;
}) {
  const { ref, els, shown } = useSelectionBar(controller);
  if (els.length === 0) return null;
  return (
    <div
      ref={ref}
      className="selection-bar"
      role="toolbar"
      aria-label="Selection"
      data-shown={shown}
      inert={!shown}
    >
      <Fields controller={controller} sel={els} onTokenOptions={onTokenOptions} />
    </div>
  );
}

function useSelectionBar(controller: SceneController) {
  const context = useCampaign();
  const sel = useQuery(controller.selectedElements);
  const cam = useQuery(controller.camera);
  const pressing = useQuery(controller.pressing);
  const tool = useQuery(context.tools.activeTool);
  const reference = useRef<HTMLDivElement>(null);
  // The last selection stays shown while the bar fades away.
  const [last, setLast] = useState(sel);
  if (sel.length > 0 && sel !== last) setLast(sel);
  const shown = tool === "select" && sel.length > 0 && !pressing;
  const els = sel.length > 0 ? sel : last;
  const b = bounds(els);

  // Over the selection, or under it where there's no room above; inside the scene's open space.
  useLayoutEffect(() => {
    const bar = reference.current;
    if (!bar || !b) return;
    const host = controller.host.getBoundingClientRect();
    const inset = controller.renderer.insets();
    const top = toScreen(cam, { x: b.x + b.w / 2, y: b.y });
    const bottom = toScreen(cam, { x: b.x + b.w / 2, y: b.y + b.h });
    const { offsetWidth: w, offsetHeight: h } = bar;
    const minY = host.top + inset.top + MARGIN;
    const above = host.top + top.y - GAP - h;
    const below = Math.max(minY, host.top + bottom.y + GAP);
    // At the top of the view when the selection is too tall for either, as a map often is.
    const fitsBelow = below + h <= host.bottom - MARGIN;
    let y = minY;
    if (above >= minY) y = above;
    else if (fitsBelow) y = below;
    const minX = host.left + inset.left + MARGIN;
    const maxX = host.right - inset.right - MARGIN - w;
    const x = Math.max(minX, Math.min(maxX, host.left + top.x - w / 2));
    bar.style.translate = `${Math.round(x)}px ${Math.round(y)}px`;
    bar.dataset["below"] = String(above < minY && fitsBelow);
  });

  return { ref: reference, els, shown };
}

/** What can be changed about everything in `sel`. */
function Fields({
  controller,
  sel,
  onTokenOptions,
}: {
  controller: SceneController;
  sel: readonly SceneElement[];
  onTokenOptions: (id: string, from: Element) => void;
}) {
  const detecting = useQuery(controller.wallDetection.state);
  const aligning = useQuery(controller.aligning);
  const fields = useSelectionFields(controller, sel, onTokenOptions);
  if (detecting && sel.length === 1 && sel[0]!.id === detecting.mapId)
    return <DetectWallsFields detector={controller.wallDetection} detection={detecting} />;
  if (aligning && sel.length === 1 && sel[0]!.id === aligning.mapId)
    return <AlignMapFields controller={controller} alignment={aligning} />;
  return fields;
}

function useSelectionFields(
  controller: SceneController,
  sel: readonly SceneElement[],
  onTokenOptions: (id: string, from: Element) => void,
) {
  const context = useCampaign();
  const { smartShapes } = useQuery(context.tools.pen);
  return buildSelectionFields(controller, sel, onTokenOptions, smartShapes, (patch) => {
    context.tools.setTextStyle(patch);
  });
}

function buildSelectionFields(
  controller: SceneController,
  sel: readonly SceneElement[],
  onTokenOptions: (id: string, from: Element) => void,
  smartShapes: SmartShapes,
  setTextStyle: (patch: Partial<TextStyle>) => void,
) {
  const ids = sel.map((element) => element.id);
  const first = sel[0]!;
  const set = (patch: ElementPatch) => {
    controller.setProps(ids, patch);
  };
  const one = sel.length === 1 ? first : null;
  const { grid } = controller.renderer;
  const fields: ReactNode[] = [];

  if (one?.type === "token" && one.characterId)
    fields.push(<TokenStats key="stats" characterId={one.characterId} hidden={!!one.hideBars} />);
  if (every(sel, "effect")) {
    const { effect } = sel[0]!;
    fields.push(
      <Segmented
        key="effect"
        label="Effect"
        // None chosen when the zones differ.
        value={sel.every((element) => element.effect === effect) ? effect : ("" as EffectKind)}
        options={EFFECT_OPTIONS}
        onChange={(effect) => {
          set({ effect });
        }}
      />,
      <EffectSightToggles
        key="sight"
        // On only where every zone has it.
        value={{
          glow: sel.every((element) => element.glow),
          obscures: sel.every((element) => element.obscures),
        }}
        onChange={(patch) => {
          set(Object.fromEntries(Object.entries(patch).map(([k, on]) => [k, on || undefined])));
        }}
      />,
    );
  }
  if (every(sel, "fog")) {
    const { force } = sel[0]!;
    fields.push(
      <Segmented
        key="fog"
        label="Fog of War"
        // None chosen when the shapes differ.
        value={sel.every((element) => element.force === force) ? force : ("" as FogForce)}
        options={FOG_FORCE_OPTIONS}
        onChange={(next) => {
          set({ force: next });
        }}
      />,
    );
  }
  if (every(sel, "text"))
    fields.push(
      <TextStyleFields
        key="text-style"
        value={sharedTextStyle(sel)}
        onChange={(patch) => {
          set(patch);
          // New text follows, as does text being edited (see TextEditor).
          setTextStyle(patch);
        }}
      />,
    );
  if (every(sel, "token", "drawing", "text", "light", "effect"))
    fields.push(
      <PaintField
        key="colour"
        controller={controller}
        ids={ids}
        label={
          sel.every((element) => element.type === "token") ? "Background and Border" : "Colour"
        }
        value={sel[0]!.colour}
        prop="colour"
        disabled={sel.every(isPlainToken)}
      />,
    );
  if (every(sel, "shape"))
    fields.push(
      <PaintField
        key="stroke"
        controller={controller}
        ids={ids}
        label="Outline Colour"
        value={sel[0]!.stroke}
        prop="stroke"
      />,
      <PaintField
        key="fill"
        controller={controller}
        ids={ids}
        label="Fill Colour"
        value={sel[0]!.fill}
        prop="fill"
      />,
      <WidthField key="width" controller={controller} ids={ids} value={sel[0]!.width} />,
    );
  if (one?.type === "drawing" && smartShapes !== "always") {
    // A drawing near a shape can be made that shape, lined up with the grid as the pen would.
    const near = nearShape(one);
    const shape = near && alignToGrid(near, grid);
    if (shape)
      fields.push(
        <Button
          key="smart-shape"
          variant="icon"
          icon={SHAPE_ICONS[shape.shape]}
          label={`Convert to ${shapeName(shape)}`}
          onClick={() => {
            const id = controller.scene.replace(one.id, shapeElement(drawingInk(one), shape));
            if (id) controller.select([id]);
          }}
        />,
      );
  }
  if (every(sel, "pin"))
    fields.push(<PinTargetField key="pin-target" controller={controller} pins={sel} />);
  if (every(sel, "drawing", "shape", "text"))
    fields.push(
      <Segmented
        key="layer"
        label="Layer"
        // None chosen when they differ.
        value={
          sel.every((element) => element.layer === first.layer) ? first.layer : ("" as PenLayer)
        }
        options={PEN_LAYERS}
        onChange={(layer) => {
          controller.arrange(ids, { to: "layer", layer });
        }}
      />,
    );
  if (every(sel, "token"))
    fields.push(
      <Button
        key="hide-name"
        variant="icon"
        icon={IconReveal}
        label="Show Name"
        pressed={!sel.every((t) => t.hideName)}
        onClick={() => {
          set({ hideName: sel.every((t) => !t.hideName) ? true : undefined });
        }}
      />,
    );
  if (every(sel, "wall")) fields.push(...wallFields(sel, set));
  if (every(sel, "light")) fields.push(...lightFields(sel, grid, set));
  if (every(sel, "area"))
    fields.push(
      <Segmented
        key="tone"
        label="Area"
        value={sel[0]!.tone}
        options={[
          { id: "light", label: "Light" },
          { id: "dark", label: "Dark" },
        ]}
        onChange={(tone) => {
          set({ tone });
        }}
      />,
    );
  const locked = sel.every((element) => element.locked);
  fields.push(
    <Button
      key="lock"
      variant="icon"
      icon={locked ? IconLock : IconUnlock}
      label={locked ? "Unlock" : "Lock"}
      pressed={locked}
      onClick={() => {
        controller.setLocked(ids, !locked);
      }}
    />,
  );
  if (one?.type === "token")
    fields.push(
      <Button
        key="options"
        variant="icon"
        icon={IconSettings}
        label="Token Options"
        onClick={(e) => {
          onTokenOptions(one.id, e.currentTarget);
        }}
      />,
    );
  return fields;
}

/**
 * A property of the selection's being changed: it shows on the scene as it's
 * changed, and is set when committed, as one undo step.
 */
function usePreviewedProperty<T>(
  controller: SceneController,
  ids: string[],
  property: "colour" | "fill" | "stroke" | "width",
) {
  const [draft, setDraft] = useState<T | null>(null);
  const preview = (value: T) => {
    setDraft(value);
    controller.previewProps(ids, { [property]: value });
  };
  const commit = () => {
    if (draft === null) return;
    controller.previewProps(ids, null);
    controller.setProps(ids, { [property]: draft });
    setDraft(null);
  };
  return { draft, preview, commit };
}

/**
 * A colour of the selection's. It shows on the scene as it's picked, and
 * changes when the picker is put away, as one undo step.
 */
function PaintField({
  controller,
  ids,
  label,
  value,
  prop,
  disabled,
}: {
  controller: SceneController;
  ids: string[];
  label: string;
  value: string;
  prop: "colour" | "fill" | "stroke";
  disabled?: boolean;
}) {
  const { draft, preview, commit } = usePreviewedProperty<string>(controller, ids, prop);
  return (
    <ColourPicker
      label={label}
      alpha
      value={draft ?? value}
      disabled={disabled ?? false}
      onChange={preview}
      onClose={commit}
    />
  );
}

/** A shape's outline width: shown on the scene as it's dragged, changed when let go. */
function WidthField({
  controller,
  ids,
  value,
}: {
  controller: SceneController;
  ids: string[];
  value: number;
}) {
  const { draft, preview, commit } = usePreviewedProperty<number>(controller, ids, "width");
  return (
    <input
      type="range"
      className="selection-bar-width"
      min={PEN_WIDTH_RANGE.min}
      max={PEN_WIDTH_RANGE.max}
      value={draft ?? value}
      aria-label="Outline Width"
      data-tip="Outline Width"
      onChange={(e) => {
        preview(Number(e.currentTarget.value));
      }}
      onPointerUp={commit}
      onKeyUp={commit}
      onBlur={commit}
    />
  );
}

export default SelectionBar;
