import {
  DEFAULT_GRID,
  DIAGONAL_RULES,
  GRID_TYPES,
  MIN_GRID_SIZE,
} from "../scene/grid";
import type { SceneDoc } from "../scene/sceneDoc";
import { DEFAULT_CANVAS_COLOUR, type Campaign } from "../store/campaign";
import { useY } from "../store/useY";
import { Segmented } from "../ui/Segmented";
import { activeMapColour, canvasColour } from "./canvasState";

export function SceneSettingsFields({
  campaign,
  sceneId,
  scene,
}: {
  campaign: Campaign;
  sceneId: string;
  scene: SceneDoc;
}) {
  const grid = useY(scene.settings, () => scene.grid());
  const lighting = useY(scene.settings, () => scene.lighting());
  const view = useY(campaign.scenes, () =>
    campaign.sceneViews().find((s) => s.id === sceneId),
  );
  const isGm = campaign.isGm();
  const shown = view
    ? canvasColour(view, activeMapColour.value)
    : DEFAULT_CANVAS_COLOUR;
  const auto = !view?.canvasColour;
  const num = (v: string, fallback: number) =>
    Number.isFinite(parseFloat(v)) ? parseFloat(v) : fallback;

  return (
    <section class="scene-settings-fields" aria-label="Scene settings">
      <h3 class="eyebrow">Scene settings</h3>
      <div class="field">
        Grid
        <Segmented
          label="Grid type"
          value={grid.type}
          options={GRID_TYPES}
          disabled={!isGm}
          onChange={(type) => scene.setGrid({ type })}
        />
      </div>
      <div class="field-row">
        <label class="field">
          Cell size (px)
          <input
            class="input bevel"
            type="number"
            min={MIN_GRID_SIZE}
            step={1}
            value={grid.size}
            disabled={!isGm || grid.type === "none"}
            onChange={(e) =>
              scene.setGrid({
                size: Math.max(
                  MIN_GRID_SIZE,
                  num(e.currentTarget.value, DEFAULT_GRID.size),
                ),
              })
            }
          />
        </label>
        <label class="field">
          Offset X
          <input
            class="input bevel"
            type="number"
            step={1}
            value={grid.offsetX}
            disabled={!isGm || grid.type === "none"}
            onChange={(e) =>
              scene.setGrid({ offsetX: num(e.currentTarget.value, 0) })
            }
          />
        </label>
        <label class="field">
          Offset Y
          <input
            class="input bevel"
            type="number"
            step={1}
            value={grid.offsetY}
            disabled={!isGm || grid.type === "none"}
            onChange={(e) =>
              scene.setGrid({ offsetY: num(e.currentTarget.value, 0) })
            }
          />
        </label>
      </div>
      <div class="field-row">
        <label class="field">
          Each cell is
          <input
            class="input bevel"
            type="number"
            min={0}
            step="any"
            value={grid.unit}
            disabled={!isGm}
            onChange={(e) =>
              scene.setGrid({
                unit: Math.max(
                  0,
                  num(e.currentTarget.value, DEFAULT_GRID.unit),
                ),
              })
            }
          />
        </label>
        <label class="field">
          Unit
          <input
            class="input bevel"
            value={grid.unitName}
            disabled={!isGm}
            autoComplete="off"
            onChange={(e) =>
              scene.setGrid({ unitName: e.currentTarget.value.trim() })
            }
          />
        </label>
      </div>
      {grid.type === "square" && (
        <div class="field">
          Diagonal steps count as
          <Segmented
            label="Diagonal steps"
            value={grid.diagonal}
            options={DIAGONAL_RULES}
            disabled={!isGm}
            onChange={(diagonal) => scene.setGrid({ diagonal })}
          />
        </div>
      )}
      <div class="field">
        Canvas colour
        <span class="colour-row">
          <Segmented
            label="Canvas colour"
            value={auto ? "auto" : "custom"}
            options={[
              {
                id: "auto",
                label: "Auto",
                title: "A dark shade of the map’s colour",
              },
              { id: "custom", label: "Custom" },
            ]}
            disabled={!isGm}
            onChange={(v) =>
              campaign.updateScene(sceneId, {
                canvasColour: v === "auto" ? null : shown,
              })
            }
          />
          <input
            type="color"
            class="colour-input bevel"
            value={shown}
            aria-label="Pick a canvas colour"
            disabled={!isGm}
            onInput={(e) =>
              campaign.updateScene(sceneId, {
                canvasColour: e.currentTarget.value,
              })
            }
          />
        </span>
      </div>
      <div class="field">
        Lighting
        <Segmented
          label="Lighting"
          value={lighting.enabled ? "on" : "off"}
          options={[
            { id: "off", label: "Off" },
            { id: "on", label: "Dynamic" },
          ]}
          disabled={!isGm}
          onChange={(v) => scene.setLighting({ enabled: v === "on" })}
        />
        {lighting.enabled && (
          <label class="field">
            Darkness where no light reaches:{" "}
            {Math.round(lighting.darkness * 100)}%
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(lighting.darkness * 100)}
              disabled={!isGm}
              onChange={(e) =>
                scene.setLighting({
                  darkness: Number(e.currentTarget.value) / 100,
                })
              }
            />
          </label>
        )}
      </div>
      <div class="field">
        Players see
        <Segmented
          label="Players see"
          value={lighting.vision ? "sight" : "all"}
          options={[
            { id: "all", label: "Everything" },
            { id: "sight", label: "What their tokens see" },
          ]}
          disabled={!isGm}
          onChange={(v) => scene.setLighting({ vision: v === "sight" })}
        />
      </div>
      {!isGm && <p class="muted">Only the GM can change scene settings.</p>}
    </section>
  );
}
