import { DEFAULT_GRID, DIAGONAL_RULES, GRID_TYPES, MIN_GRID_SIZE } from "../scene/grid";
import type { SceneDoc } from "../scene/sceneDoc";
import { DEFAULT_CANVAS_COLOUR, type Campaign } from "../campaign/campaign";
import { useQuery } from "../ui/useQuery";
import { ColourPicker } from "../ui/ColourPicker";
import { Segmented } from "../ui/Segmented";
import { canvasColour } from "../workspace/canvasState";
import { useCampaign } from "../workspace/campaignContext";
import { setGrid, setLighting, updateScene } from "../workspace/commands/scenes";
import { can } from "../workspace/commands/views";
import type { SceneLighting } from "../scene/sceneDoc";
import type { Grid } from "../scene/grid";

const num = (v: string, fallback: number) =>
  Number.isFinite(parseFloat(v)) ? parseFloat(v) : fallback;

export function SceneSettingsFields({
  campaign,
  sceneId,
  scene,
  showHeading = true,
}: {
  campaign: Campaign;
  sceneId: string;
  scene: SceneDoc;
  showHeading?: boolean;
}) {
  const ctx = useCampaign();
  const grid = useQuery(scene.settings, () => scene.grid());
  const lighting = useQuery(scene.settings, () => scene.lighting());
  const view = useQuery(campaign.scenes, () => campaign.sceneViews().find((s) => s.id === sceneId));
  const editable = can(ctx, setGrid, { id: sceneId, patch: {} });
  const setGridOf = (patch: Partial<Grid>) => ctx.execute(setGrid, { id: sceneId, patch });
  const setLightingOf = (patch: Partial<SceneLighting>) =>
    ctx.execute(setLighting, { id: sceneId, patch });
  const mapColour = useQuery(ctx.canvas.activeMapColour);
  const shown = view ? canvasColour(view, mapColour) : DEFAULT_CANVAS_COLOUR;
  const auto = !view?.canvasColour;

  return (
    <section className="form-layout" aria-label="Scene settings">
      {showHeading && <h3 className="form-title">Scene settings</h3>}
      <section className="form-section" aria-label="Grid">
        <h4 className="form-heading">Grid</h4>
        <div className="field">
          Type
          <Segmented
            label="Grid type"
            value={grid.type}
            options={GRID_TYPES}
            disabled={!editable}
            onChange={(type) => setGridOf({ type })}
          />
        </div>
        <div className="field-row">
          <label className="field">
            Cell size (px)
            <input
              type="number"
              min={MIN_GRID_SIZE}
              step={1}
              value={grid.size}
              disabled={!editable || grid.type === "none"}
              onChange={(e) =>
                setGridOf({
                  size: Math.max(MIN_GRID_SIZE, num(e.currentTarget.value, DEFAULT_GRID.size)),
                })
              }
            />
          </label>
          <label className="field">
            Offset X
            <input
              type="number"
              step={1}
              value={grid.offsetX}
              disabled={!editable || grid.type === "none"}
              onChange={(e) => setGridOf({ offsetX: num(e.currentTarget.value, 0) })}
            />
          </label>
          <label className="field">
            Offset Y
            <input
              type="number"
              step={1}
              value={grid.offsetY}
              disabled={!editable || grid.type === "none"}
              onChange={(e) => setGridOf({ offsetY: num(e.currentTarget.value, 0) })}
            />
          </label>
        </div>
        <div className="field-row">
          <label className="field">
            Each cell is
            <input
              type="number"
              min={0}
              step="any"
              value={grid.unit}
              disabled={!editable}
              onChange={(e) =>
                setGridOf({
                  unit: Math.max(0, num(e.currentTarget.value, DEFAULT_GRID.unit)),
                })
              }
            />
          </label>
          <label className="field">
            Unit
            <input
              value={grid.unitName}
              disabled={!editable}
              autoComplete="off"
              onChange={(e) => setGridOf({ unitName: e.currentTarget.value.trim() })}
            />
          </label>
        </div>
        {grid.type === "square" && (
          <div className="field">
            Diagonal steps count as
            <Segmented
              label="Diagonal steps"
              value={grid.diagonal}
              options={DIAGONAL_RULES}
              disabled={!editable}
              onChange={(diagonal) => setGridOf({ diagonal })}
            />
          </div>
        )}
      </section>
      <section className="form-section" aria-label="Appearance">
        <h4 className="form-heading">Appearance</h4>
        <div className="field">
          Canvas colour
          <span className="colour-row">
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
              disabled={!editable}
              onChange={(v) =>
                ctx.execute(updateScene, {
                  id: sceneId,
                  patch: { canvasColour: v === "auto" ? null : shown },
                })
              }
            />
            <ColourPicker
              label="Pick a canvas colour"
              value={shown}
              disabled={!editable}
              onChange={(next) =>
                ctx.execute(updateScene, { id: sceneId, patch: { canvasColour: next } })
              }
            />
          </span>
        </div>
      </section>
      <section className="form-section" aria-label="Lighting">
        <h4 className="form-heading">Lighting</h4>
        <div className="field">
          Mode
          <Segmented
            label="Lighting mode"
            value={lighting.enabled ? "on" : "off"}
            options={[
              { id: "off", label: "Off" },
              { id: "on", label: "Dynamic" },
            ]}
            disabled={!editable}
            onChange={(v) => setLightingOf({ enabled: v === "on" })}
          />
          {lighting.enabled && (
            <label className="field">
              Darkness where no light reaches: {Math.round(lighting.darkness * 100)}%
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(lighting.darkness * 100)}
                disabled={!editable}
                onChange={(e) =>
                  setLightingOf({
                    darkness: Number(e.currentTarget.value) / 100,
                  })
                }
              />
            </label>
          )}
        </div>
        <div className="field">
          Players see
          <Segmented
            label="Players see"
            value={lighting.vision ? "sight" : "all"}
            options={[
              { id: "all", label: "Everything" },
              { id: "sight", label: "What their tokens see" },
            ]}
            disabled={!editable}
            onChange={(v) => setLightingOf({ vision: v === "sight" })}
          />
        </div>
      </section>
      {!editable && <p className="muted">Only the GM can change scene settings.</p>}
    </section>
  );
}
