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
import { ContextMenu  } from "../ui/ContextMenu";
import type {MenuItem} from "../ui/ContextMenu";
import { menuTrigger } from "../ui/menuTrigger";
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
import { scenesLayout } from "./panelLayouts";
import { FolderTree } from "./FolderTree";
import { SceneSettingsFields } from "./SceneSettingsFields";

/** How many players are in each scene; those not in a known scene count towards the first. */
function usePlayerCounts(campaign: Campaign, scenes: SceneView[]) {
  const members = useQuery(campaign.members, () => campaign.memberViews());
  const known = new Set(scenes.map((s) => s.id));
  const counts = new Map<string, number>();
  for (const member of members) {
    if (member.role !== "player") continue;
    const sceneId =
      member.activeSceneId && known.has(member.activeSceneId)
        ? member.activeSceneId
        : scenes[0]?.id;
    if (sceneId) counts.set(sceneId, (counts.get(sceneId) ?? 0) + 1);
  }
  return counts;
}

function SceneRow({
  scene,
  active,
  playerCount,
  onOpen,
}: {
  scene: SceneView;
  active: boolean;
  playerCount: number;
  onOpen: () => void;
}) {
  const context = useCampaign();
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const trigger = menuTrigger((x, y) => { setMenu({ x, y, items: menuFor(context, { kind: "scene", id: scene.id }) }); },
  );
  return (
    <li className="scene-item" data-active={active} data-scene-id={scene.id}>
      <button
        type="button"
        className="scene-name-button"
        aria-current={active ? "true" : undefined}
        onClick={onOpen}
        {...trigger}
      >
        {scene.name}
      </button>
      {playerCount > 0 && (
        <span
          className="scene-presence"
          title={`${playerCount} ${playerCount === 1 ? "player" : "players"} here`}
        >
          <IconMembers size={16} /> {playerCount} here
        </span>
      )}
      {menu && <ContextMenu {...menu} onClose={() => { setMenu(null); }} />}
    </li>
  );
}

/** The active scene's name, settings and graphic, for whoever may change them. */
function SceneDetail({ campaign, active }: { campaign: Campaign; active: SceneView | undefined }) {
  const context = useCampaign();
  const commands = useQuery(context.canvas.canvasCommands);
  const graphic = useQuery(campaign.entityGraphics, () =>
    active ? getEntityGraphic(campaign, "scene", active.id, "map") : undefined,
  );
  if (!active || !can(context, updateScene, { id: active.id, patch: {} }))
    return <div className="panel-scroll scene-panel" />;
  const scene = commands?.sceneId === active.id ? commands.scene : null;
  return (
    <div className="panel-scroll scene-panel">
      <input
        className="title"
        value={active.name}
        aria-label="Scene name"
        onChange={(e) =>
          context.execute(updateScene, {
            id: active.id,
            patch: { name: e.currentTarget.value || "Untitled scene" },
          })
        }
      />
      <Button variant="secondary" onClick={() => context.execute(pullPlayers, { id: active.id })}>
        <IconMembers size={22} /> Pull Players Here
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
          context.execute(chooseGraphic, { kind: "scene", id: active.id, graphic })
        }
        onReset={() => context.execute(chooseGraphic, { kind: "scene", id: active.id })}
      />
    </div>
  );
}

/** The scene list, and the active scene's settings. (Campaign actions are in the tool strip's menu.) */
export function ScenePanel({ campaign }: { campaign: Campaign }) {
  const context = useCampaign();
  const scenes = useQuery(campaign.scenes, () => campaign.sceneViews());
  const folders = useQuery(campaign.sceneFolders, () => listSceneFolders(campaign.sceneFolders));
  const activeId =
    useQuery(campaign.members, () => campaign.activeSceneId()) ?? scenes[0]?.id ?? null;
  const active = scenes.find((s) => s.id === activeId);
  const { level, go, show } = usePaneLevel(scenesLayout, active ? "detail" : "list");
  const playerCounts = usePlayerCounts(campaign, scenes);

  return (
    <TwoPane
      layout={scenesLayout}
      level={level}
      title={active?.name ?? "Scenes"}
      backLabel="Back to the scene list"
      onBack={() => { go("list"); }}
      resizeLabel="Resize the scene list"
      list={
        <FolderTree
          ariaLabel="Scenes"
          className="scene-tree"
          folders={folders}
          items={scenes}
          folderOf={(s) => s.folder}
          renderItem={(s) => (
            <SceneRow
              key={s.id}
              scene={s}
              active={s.id === activeId}
              playerCount={playerCounts.get(s.id) ?? 0}
              onOpen={() => {
                context.execute(openScene, { id: s.id });
                go("detail");
              }}
            />
          )}
          renderActions={(newFolder) =>
            can(context, newScene, {}) && (
              <>
                <Button
                  variant="secondary"
                  icon={IconAdd}
                  onClick={() => context.execute(newScene, {}) && go("detail")}
                >
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
            scenes.length === 0 && folders.length === 0 ? (
              <p className="empty-inline">No scenes yet.</p>
            ) : null
          }
        />
      }
      detail={<SceneDetail campaign={campaign} active={active} />}
    />
  );
}
