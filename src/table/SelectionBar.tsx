import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { SceneController } from "../scene/controller";
import type { ElementPatch } from "../scene/sceneDoc";
import { bounds } from "../scene/geometry";
import { toScreen } from "../scene/camera";
import { HANDLE_SIZE, ROTATE_HANDLE_GAP } from "../scene/render/handles";
import { PEN_WIDTH_RANGE } from "../scene/tools";
import { isPlainToken, type EffectKind, type SceneElement } from "../scene/types";
import { ColourPicker } from "../ui/ColourPicker";
import { CommitInput } from "../ui/CommitInput";
import { Button } from "../ui/Button";
import { Segmented } from "../ui/Segmented";
import { IconLight, IconLock, IconReveal, IconUnlock } from "../ui/icons";
import { useQuery } from "../ui/useQuery";
import { EFFECT_OPTIONS, EffectSightToggles } from "./effectOptions";
import { useCampaign } from "../workspace/campaignContext";
import "./SelectionBar.css";

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
  return sel.every((el) => typeSet.has(el.type as T));
};

/**
 * The selection's properties, in a bar over it: whatever can be changed about
 * everything selected, each change applying as it's made. It keeps out of the
 * way while a press is under way, and follows the selection as the camera moves.
 */
export function SelectionBar({
  controller,
  onTokenOptions,
}: {
  controller: SceneController;
  /** Open the full options for a token, growing out of `from`. */
  onTokenOptions: (id: string, from: Element) => void;
}) {
  const ctx = useCampaign();
  const sel = useQuery(controller.selectedElements);
  const cam = useQuery(controller.camera);
  const pressing = useQuery(controller.pressing);
  const tool = useQuery(ctx.tools.activeTool);
  const ref = useRef<HTMLDivElement>(null);
  // The last selection stays shown while the bar fades away.
  const [last, setLast] = useState(sel);
  if (sel.length && sel !== last) setLast(sel);
  const shown = tool === "select" && sel.length > 0 && !pressing;
  const els = sel.length ? sel : last;
  const b = bounds(els);

  // Over the selection, or under it where there's no room above; inside the scene's open space.
  useLayoutEffect(() => {
    const bar = ref.current;
    if (!bar || !b) return;
    const host = controller.host.getBoundingClientRect();
    const inset = controller.renderer.insets();
    const top = toScreen(cam, { x: b.x + b.w / 2, y: b.y });
    const bottom = toScreen(cam, { x: b.x + b.w / 2, y: b.y + b.h });
    const { offsetWidth: w, offsetHeight: h } = bar;
    const minY = host.top + inset.top + MARGIN;
    const above = host.top + top.y - GAP - h;
    const y = above >= minY ? above : Math.max(minY, host.top + bottom.y + GAP);
    const minX = host.left + inset.left + MARGIN;
    const maxX = host.right - inset.right - MARGIN - w;
    const x = Math.max(minX, Math.min(maxX, host.left + top.x - w / 2));
    bar.style.translate = `${Math.round(x)}px ${Math.round(y)}px`;
    bar.dataset.below = String(above < minY);
  });

  if (!els.length) return null;
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
  const ids = sel.map((el) => el.id);
  const first = sel[0]!;
  const set = (patch: ElementPatch) => controller.setProps(ids, patch);
  const one = sel.length === 1 ? first : null;
  const grid = controller.renderer.grid;
  const fields: ReactNode[] = [];

  if (one?.type === "token")
    fields.push(
      <CommitInput
        key="name"
        className="input selection-bar-name"
        aria-label="Name"
        placeholder="Name"
        value={one.name}
        onCommit={(name) => set({ name })}
      />,
    );
  if (every(sel, "effect")) {
    const effect = sel[0]!.effect;
    fields.push(
      <Segmented
        key="effect"
        label="Effect"
        // None chosen when the zones differ.
        value={sel.every((el) => el.effect === effect) ? effect : ("" as EffectKind)}
        options={EFFECT_OPTIONS}
        onChange={(effect) => set({ effect })}
      />,
      <EffectSightToggles
        key="sight"
        // On only where every zone has it.
        value={{ glow: sel.every((el) => el.glow), obscures: sel.every((el) => el.obscures) }}
        onChange={(patch) =>
          set(Object.fromEntries(Object.entries(patch).map(([k, on]) => [k, on || undefined])))
        }
      />,
    );
  }
  if (every(sel, "token", "drawing", "text", "light", "effect"))
    fields.push(
      <PaintField
        key="colour"
        controller={controller}
        ids={ids}
        label={sel.every((el) => el.type === "token") ? "Background and Border" : "Colour"}
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
  if (every(sel, "drawing", "shape"))
    fields.push(
      <Segmented
        key="layer"
        label="Layer"
        value={first.layer === "under" ? "under" : "over"}
        options={[
          { id: "over", label: "Over Tokens" },
          { id: "under", label: "Under Tokens" },
        ]}
        onChange={(layer) => controller.setLayer(ids, layer)}
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
        onClick={() => set({ hideName: sel.every((t) => !t.hideName) ? true : undefined })}
      />,
    );
  if (every(sel, "wall")) {
    const doors = sel.every((w) => w.door);
    fields.push(
      <Segmented
        key="door"
        label="Wall or Door"
        value={doors ? "door" : "wall"}
        options={[
          { id: "wall", label: "Wall" },
          { id: "door", label: "Door" },
        ]}
        onChange={(kind) => set(kind === "door" ? { door: true, open: false } : { door: false })}
      />,
    );
    if (doors)
      fields.push(
        <Segmented
          key="open"
          label="Door"
          value={sel.every((w) => w.open) ? "open" : "closed"}
          options={[
            { id: "closed", label: "Closed" },
            { id: "open", label: "Open" },
          ]}
          onChange={(state) => set({ open: state === "open" })}
        />,
      );
  }
  if (every(sel, "light")) {
    const l = sel[0]!;
    // Radii in the grid's units: bright out to one, dim out to the other.
    const toUnits = (px: number) => String(Math.round((px / grid.size) * grid.unit * 10) / 10);
    const toPx = (units: string) => (Number(units) / (grid.unit || 1)) * grid.size;
    const radius = (key: "bright" | "dim", label: string) => (
      <label key={key} className="selection-bar-number">
        {label}
        <CommitInput
          type="number"
          min={0}
          step={grid.unit || 1}
          aria-label={`${label} (${grid.unitName})`}
          value={toUnits(l[key])}
          onCommit={(v) => {
            const px = toPx(v);
            if (!Number.isFinite(px) || px < 0) return;
            // Dim light reaches at least as far as bright.
            set(
              key === "bright"
                ? { bright: px, dim: Math.max(px, l.dim) }
                : { dim: px, bright: Math.min(px, l.bright) },
            );
          }}
        />
        <span className="muted">{grid.unitName}</span>
      </label>
    );
    fields.push(
      radius("bright", "Bright"),
      radius("dim", "Dim"),
      <Button
        key="flicker"
        variant="icon"
        icon={IconLight}
        label="Flicker"
        pressed={sel.every((x) => x.flicker)}
        onClick={() => set({ flicker: sel.every((x) => x.flicker) ? undefined : true })}
      />,
    );
  }
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
        onChange={(tone) => set({ tone })}
      />,
    );
  const locked = sel.every((el) => el.locked);
  fields.push(
    <Button
      key="lock"
      variant="icon"
      icon={locked ? IconLock : IconUnlock}
      label={locked ? "Unlock" : "Lock"}
      pressed={locked}
      onClick={() => controller.setLocked(ids, !locked)}
    />,
  );
  if (one?.type === "token")
    fields.push(
      <Button
        key="options"
        variant="ghost"
        onClick={(e) => onTokenOptions(one.id, e.currentTarget)}
      >
        Options…
      </Button>,
    );
  return fields;
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
  prop: "colour" | "stroke" | "fill";
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <ColourPicker
      label={label}
      alpha
      value={draft ?? value}
      disabled={disabled ?? false}
      onChange={(colour) => {
        setDraft(colour);
        controller.previewProps(ids, { [prop]: colour });
      }}
      onClose={() => {
        if (draft === null) return;
        controller.previewProps(ids, null);
        controller.setProps(ids, { [prop]: draft });
        setDraft(null);
      }}
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
  const [draft, setDraft] = useState<number | null>(null);
  const commit = () => {
    if (draft === null) return;
    controller.previewProps(ids, null);
    controller.setProps(ids, { width: draft });
    setDraft(null);
  };
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
        const width = Number(e.currentTarget.value);
        setDraft(width);
        controller.previewProps(ids, { width });
      }}
      onPointerUp={commit}
      onKeyUp={commit}
      onBlur={commit}
    />
  );
}
