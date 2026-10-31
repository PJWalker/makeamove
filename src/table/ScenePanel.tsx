import { useSignal, useSignalEffect } from "@preact/signals";
import { useRef } from "preact/hooks";
import type { Campaign, SceneView } from "../store/campaign";
import { useY } from "../store/useY";
import { Button } from "../ui/Button";
import {
  IconAdd,
  IconDelete,
  IconFolder,
  IconMembers,
  IconRename,
} from "../ui/icons";
import { openPopup } from "../ui/popup";
import { canvasCommands, dialogRequest } from "./canvasState";
import { HelpDialog, SettingsDialog } from "./CampaignDialogs";
import { RelationshipsDialog } from "./Relationships";
import { createPaneLayout, TwoPane, usePaneLevel } from "../ui/TwoPane";
import { GraphicPicker } from "../ui/GraphicPicker";
import { getEntityGraphic, setEntityGraphic } from "./entityGraphics";
import { SceneSettingsFields } from "./SceneSettingsFields";
import { FolderTree } from "./FolderTree";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { menuTrigger } from "../ui/menuTrigger";
import {
  createSceneFolder,
  deleteSceneFolder,
  listSceneFolders,
  moveSceneToFolder,
  renameSceneFolder,
} from "../scene/folders";

/** Side by side or one at a time (ui/TwoPane.tsx). */
export const scenesLayout = createPaneLayout("scenesList", {
  list: "scenes",
  detail: "settings",
});

/**
 * The campaign's dialogs, always mounted so the command palette and the Scene
 * panel can open them whether or not that panel is on screen.
 */
export function CampaignDialogHost({ campaign }: { campaign: Campaign }) {
  const settingsRef = useRef<HTMLDialogElement>(null);
  const helpRef = useRef<HTMLDialogElement>(null);
  const webRef = useRef<HTMLDialogElement>(null);

  useSignalEffect(() => {
    const want = dialogRequest.value;
    if (!want) return;
    dialogRequest.value = null;
    const dialog = {
      settings: settingsRef,
      help: helpRef,
      relationships: webRef,
    }[want].current;
    openPopup(dialog);
  });

  return (
    <>
      <SettingsDialog campaign={campaign} dialogRef={settingsRef} />
      <HelpDialog dialogRef={helpRef} />
      <RelationshipsDialog campaign={campaign} dialogRef={webRef} />
    </>
  );
}

/** The scene list, and the active scene's settings. (Campaign actions are in the tool strip's menu.) */
export function ScenePanel({ campaign }: { campaign: Campaign }) {
  const scenes = useY(campaign.scenes, () => campaign.sceneViews());
  const folders = useY(campaign.sceneFolders, () => listSceneFolders(campaign));
  const activeId =
    useY(campaign.members, () => campaign.activeSceneId()) ??
    scenes[0]?.id ??
    null;
  const members = useY(campaign.members, () => campaign.memberViews());
  const campaignName = useY(campaign.meta, () => campaign.name);
  const isGm = campaign.isGm();
  const active = scenes.find((s) => s.id === activeId);
  const { level, go } = usePaneLevel(scenesLayout, active ? "detail" : "list");
  const menu = useSignal<{ x: number; y: number; items: MenuItem[] } | null>(
    null,
  );
  const scene =
    active && canvasCommands.value?.sceneId === active.id
      ? canvasCommands.value.scene
      : null;
  const graphic = useY(campaign.entityGraphics, () =>
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
    if (sceneId)
      playerCounts.set(sceneId, (playerCounts.get(sceneId) ?? 0) + 1);
  }

  function addScene(folderId?: string) {
    const id = campaign.addScene(`Scene ${scenes.length + 1}`);
    if (folderId) moveSceneToFolder(campaign, id, folderId);
    campaign.setActiveScene(id);
    go("detail");
  }

  function openScene(id: string) {
    campaign.setActiveScene(id);
    go("detail");
  }

  function sceneRow(s: SceneView) {
    const trigger = menuTrigger((x, y) => {
      const items: MenuItem[] = [
        { label: "Open scene", onSelect: () => openScene(s.id) },
      ];
      if (isGm) {
        items.push("divider", {
          label: "Pull players here",
          Icon: IconMembers,
          onSelect: () => campaign.pullPlayersToScene(s.id),
        });
        for (const folder of folders) {
          if (folder.id !== s.folder) {
            items.push({
              label: `Move to ${folder.name}`,
              Icon: IconFolder,
              onSelect: () => moveSceneToFolder(campaign, s.id, folder.id),
            });
          }
        }
        if (s.folder && folders.some((folder) => folder.id === s.folder)) {
          items.push({
            label: "Remove from folder",
            onSelect: () => moveSceneToFolder(campaign, s.id),
          });
        }
        if (scenes.length > 1) {
          items.push("divider", {
            label: "Delete scene",
            Icon: IconDelete,
            danger: true,
            onSelect: () => campaign.removeScene(s.id),
          });
        }
      }
      menu.value = { x, y, items };
    });
    const playerCount = playerCounts.get(s.id) ?? 0;
    return (
      <li
        key={s.id}
        class="scene-item"
        data-active={s.id === activeId}
        data-scene-id={s.id}
      >
        <button
          type="button"
          class="scene-name-button"
          aria-current={s.id === activeId ? "true" : undefined}
          onClick={() => openScene(s.id)}
          onPointerDown={trigger.onPointerDown}
          onContextMenu={trigger.onContextMenu}
        >
          {s.name}
        </button>
        {playerCount > 0 && (
          <span
            class="scene-presence"
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
      level={level.value}
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
            renderActions={(beginFolderNaming) => (
              <>
                <div class="eyebrow scene-campaign-name">{campaignName}</div>
                {isGm && (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => addScene()}
                    >
                      <IconAdd size={22} /> New scene
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={beginFolderNaming}
                    >
                      New folder
                    </Button>
                  </>
                )}
              </>
            )}
            folderMenuItems={(folder, { open, toggle, rename }) => [
              {
                label: open ? "Collapse folder" : "Expand folder",
                onSelect: toggle,
              },
              ...(isGm
                ? [
                    "divider" as const,
                    {
                      label: "New scene here",
                      Icon: IconAdd,
                      onSelect: () => addScene(folder.id),
                    },
                    {
                      label: "Rename folder",
                      Icon: IconRename,
                      onSelect: rename,
                    },
                    {
                      label: "Delete folder",
                      Icon: IconDelete,
                      danger: true,
                      onSelect: () => deleteSceneFolder(campaign, folder.id),
                    },
                  ]
                : []),
            ]}
            onCreateFolder={(name) => createSceneFolder(campaign, name)}
            onRenameFolder={(id, name) => renameSceneFolder(campaign, id, name)}
            emptyContent={
              !scenes.length && !folders.length ? (
                <p class="empty-inline">No scenes yet.</p>
              ) : null
            }
          />
          {menu.value && (
            <ContextMenu {...menu.value} onClose={() => (menu.value = null)} />
          )}
        </>
      }
      detail={
        <div class="panel-scroll scene-panel">
          {isGm && active && (
            <input
              class="scene-name-input"
              value={active.name}
              aria-label="Scene name"
              onChange={(e) =>
                campaign.updateScene(active.id, {
                  name: e.currentTarget.value || "Untitled scene",
                })
              }
            />
          )}
          {isGm && active && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => campaign.pullPlayersToScene(active.id)}
              >
                <IconMembers size={22} /> Pull players here
              </Button>
              {scene ? (
                <SceneSettingsFields
                  campaign={campaign}
                  sceneId={active.id}
                  scene={scene}
                />
              ) : (
                <p class="muted">Loading scene settings…</p>
              )}
              <GraphicPicker
                label="Scene graphic"
                graphic={graphic}
                onChange={(next) =>
                  setEntityGraphic(campaign, "scene", active.id, next)
                }
                onReset={() => setEntityGraphic(campaign, "scene", active.id)}
              />
            </>
          )}
        </div>
      }
    />
  );
}
