import { useState } from "react";
import type { Campaign, SceneView } from "../campaign/campaign";
import { listSceneFolders } from "../campaign/sceneFolders";
import { useQuery } from "../ui/useQuery";
import { Button } from "../ui/Button";
import { IconAdd, IconMembers, IconNewFolder } from "../ui/icons";
import { TwoPane } from "../ui/TwoPane";
import { usePaneLevel } from "../ui/paneLevel";
import { GraphicPicker } from "../ui/GraphicPicker";
import { getEntityGraphic } from "../workspace/entityGraphics";
import { SceneSettingsFields } from "./SceneSettingsFields";
import { FolderTree } from "./FolderTree";
import { ContextMenu, type MenuItem } from "../ui/ContextMenu";
import { menuTrigger } from "../ui/menuTrigger";
import { scenesLayout } from "./panelLayouts";
import { useCampaign } from "../workspace/campaignContext";
import { chooseGraphic } from "../workspace/commands/campaign";
import {
  newScene,
  openScene,
  pullPlayers,
  sceneFolders,
  updateScene,
} from "../workspace/commands/scenes";
import { can, menuFor } from "../workspace/commands/views";

/** The scene list, and the active scene's settings. (Campaign actions are in the tool strip's menu.) */
export function ScenePanel({ campaign }: { campaign: Campaign }) {
  const ctx = useCampaign();
  const scenes = useQuery(campaign.scenes, () => campaign.sceneViews());
  const folders = useQuery(campaign.sceneFolders, () => listSceneFolders(campaign.sceneFolders));
  const activeId =
    useQuery(campaign.members, () => campaign.activeSceneId()) ?? scenes[0]?.id ?? null;
  const members = useQuery(campaign.members, () => campaign.memberViews());
  const active = scenes.find((s) => s.id === activeId);
  const editable = !!active && can(ctx, updateScene, { id: active.id, patch: {} });
  const { level, go, show } = usePaneLevel(scenesLayout, active ? "detail" : "list");
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const commands = useQuery(ctx.canvas.canvasCommands);
  const scene = active && commands?.sceneId === active.id ? commands.scene : null;
  const graphic = useQuery(campaign.entityGraphics, () =>
    active ? getEntityGraphic(campaign, "scene", active.id, "map") : undefined,
  );
  const knownScenes = new Set(scenes.map((s) => s.id));
  const playerCounts = new Map<string, number>();
  for (const member of members) {
    if (member.role !== "player") continue;
    const sceneId =
      member.activeSceneId && knownScenes.has(member.activeSceneId)
        ? member.activeSceneId
        : scenes[0]?.id;
    if (sceneId) playerCounts.set(sceneId, (playerCounts.get(sceneId) ?? 0) + 1);
  }

  function addScene() {
    if (ctx.execute(newScene, {})) go("detail");
  }

  function open(id: string) {
    ctx.execute(openScene, { id });
    go("detail");
  }

  function sceneRow(s: SceneView) {
    const trigger = menuTrigger((x, y) =>
      setMenu({ x, y, items: menuFor(ctx, { kind: "scene", id: s.id }) }),
    );
    const playerCount = playerCounts.get(s.id) ?? 0;
    return (
      <li key={s.id} className="scene-item" data-active={s.id === activeId} data-scene-id={s.id}>
        <button
          type="button"
          className="scene-name-button"
          aria-current={s.id === activeId ? "true" : undefined}
          onClick={() => open(s.id)}
          {...trigger}
        >
          {s.name}
        </button>
        {playerCount > 0 && (
          <span
            className="scene-presence"
            title={`${playerCount} ${playerCount === 1 ? "player" : "players"} here`}
          >
            <IconMembers size={16} /> {playerCount} here
          </span>
        )}
      </li>
    );
  }

  return (
    <TwoPane
      layout={scenesLayout}
      level={level}
      title={active?.name ?? "Scenes"}
      backLabel="Back to the scene list"
      onBack={() => go("list")}
      resizeLabel="Resize the scene list"
      list={
        <>
          <FolderTree
            ariaLabel="Scenes"
            className="scene-tree"
            folders={folders}
            items={scenes}
            folderOf={(s) => s.folder}
            renderItem={sceneRow}
            renderActions={(newFolder) =>
              can(ctx, newScene, {}) && (
                <>
                  <Button variant="secondary" icon={IconAdd} onClick={() => addScene()}>
                    New Scene
                  </Button>
                  <Button variant="ghost" icon={IconNewFolder} onClick={newFolder}>
                    New Folder
                  </Button>
                </>
              )
            }
            tree="scene"
            folderCommands={sceneFolders}
            showList={() => show("list")}
            emptyContent={
              !scenes.length && !folders.length ? (
                <p className="empty-inline">No scenes yet.</p>
              ) : null
            }
          />
          {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
        </>
      }
      detail={
        <div className="panel-scroll scene-panel">
          {editable && (
            <input
              className="title"
              value={active.name}
              aria-label="Scene name"
              onChange={(e) =>
                ctx.execute(updateScene, {
                  id: active.id,
                  patch: { name: e.currentTarget.value || "Untitled scene" },
                })
              }
            />
          )}
          {editable && (
            <>
              <Button
                variant="secondary"
                onClick={() => ctx.execute(pullPlayers, { id: active.id })}
              >
                <IconMembers size={22} /> Pull players here
              </Button>
              {scene ? (
                <SceneSettingsFields campaign={campaign} sceneId={active.id} scene={scene} />
              ) : (
                <p className="muted">Loading scene settings…</p>
              )}
              <GraphicPicker
                label="Scene graphic"
                graphic={graphic}
                onChange={(graphic) =>
                  ctx.execute(chooseGraphic, { kind: "scene", id: active.id, graphic })
                }
                onReset={() => ctx.execute(chooseGraphic, { kind: "scene", id: active.id })}
              />
            </>
          )}
        </div>
      }
    />
  );
}
