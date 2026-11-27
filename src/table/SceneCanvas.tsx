import { useCallback, useEffect, useRef, useState } from "react";
import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent } from "react";
import { menuTrigger } from "../ui/menuTrigger";
import { bounds } from "../scene/geometry";
import { setMorphOrigin } from "../ui/morph";
import { openPopup } from "../ui/popup";
import { watch } from "../lib/store";
import type { SceneController } from "../scene/controller";
import type { SceneDoc as SceneDocument } from "../scene/sceneDoc";
import type { Point } from "../scene/grid";
import type { Campaign } from "../campaign/campaign";
import { useQuery } from "../ui/useQuery";
import { Dialog } from "../workspace/Dialog";
import { ContextMenu } from "../ui/ContextMenu";
import type { MenuItem } from "../ui/ContextMenu";
import { useCampaign } from "../workspace/campaignContext";
import { menuFor } from "../workspace/commands/views";
import { SceneSettingsFields } from "./SceneSettingsFields";
import { SelectionBar } from "./SelectionBar";
import { PinPicker } from "./PinPicker";
import { TextEditor } from "./TextEditor";
import { TokenOptionsDialog } from "./TokenOptionsDialog";
import {
  useExploring,
  useFog,
  useLighting,
  usePins,
  useSceneController,
  useSceneRenderer,
  useSceneShortcuts,
  useSceneTargeting,
  useSheetOnTokenSelect,
  useTextRequests,
} from "./useSceneCanvas";

/** What the scene canvas offers the rest of the table: the active map colour and the commands over the scene. */
function useCanvasCommands(
  controller: SceneController | null,
  actions: {
    openTokenOptions: (id: string, tab: "character" | "token") => void;
    importImagesAt: (at: Point) => void;
  },
) {
  const context = useCampaign();
  const { openTokenOptions, importImagesAt } = actions;
  useEffect(() => {
    if (!controller) {
      context.canvas.activeMapColour.set(null);
      context.canvas.canvasCommands.set(null);
      return;
    }
    return watch([controller.mapColour], () => {
      const colour = controller.mapColour.value;
      context.canvas.activeMapColour.set(colour);
      context.canvas.seenMapColours.set({
        ...context.canvas.seenMapColours.value,
        [controller.sceneId]: colour,
      });
      context.canvas.canvasCommands.set({
        sceneId: controller.sceneId,
        scene: controller.scene,
        controller,
        tokenOptions: openTokenOptions,
        importImagesAt,
      });
    });
  }, [context, controller, openTokenOptions, importImagesAt]);
  // The scene's undo steps are in the player's history while it's open.
  useEffect(
    () => (controller ? context.history.track(controller.scene.undo) : undefined),
    [context, controller],
  );
  useEffect(
    () => () => {
      context.canvas.canvasCommands.set(null);
    },
    [context],
  );
}

/**
 * The scene canvas: hosts the PixiJS renderer and wires it to the active
 * scene.
 */
export function SceneCanvas({ campaign, sceneId }: { campaign: Campaign; sceneId: string | null }) {
  const hostReference = useRef<HTMLDivElement>(null);
  const { renderer, ready } = useSceneRenderer(campaign, hostReference);
  const controller = useSceneController(campaign, renderer, ready, sceneId, hostReference);
  useSheetOnTokenSelect(campaign, controller);
  useLighting(campaign, controller);
  useFog(campaign, controller);
  useExploring(campaign, controller);
  const [pinRequest, setPinRequest] = usePins(controller);
  const {
    ctx,
    fileRef,
    importAt,
    dropping,
    setDropping,
    menu,
    tokenOptions,
    tokenTab,
    textEdit,
    setTextEdit,
    menuOpener,
    closeMenu,
    onDoubleClick,
    onDragOver,
    onDrop,
    onSelectionTokenOptions,
    setTokenTab,
    setTokenOptions,
  } = useSceneCanvasInteractions(controller, hostReference);
  useSceneTargeting(ctx, controller);
  useSceneShortcuts(controller);

  return (
    <>
      <div
        ref={hostReference}
        className="scene-canvas"
        data-drop={dropping}
        {...menuOpener}
        onDoubleClick={onDoubleClick}
        onDragOver={onDragOver}
        onDragLeave={() => {
          setDropping(false);
        }}
        onDrop={onDrop}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const ctl = controller;
          const { files } = e.currentTarget;
          if (ctl && files?.length)
            void ctl.importFiles([...files], importAt.current ?? ctl.centre());
          e.currentTarget.value = "";
        }}
      />
      {menu && <ContextMenu {...menu} onClose={closeMenu} />}
      {textEdit && controller && (
        <TextEditor
          key={textEdit.id ?? `${textEdit.at.x},${textEdit.at.y}`}
          controller={controller}
          request={textEdit}
          onDone={() => {
            setTextEdit(null);
          }}
        />
      )}
      {pinRequest && controller && (
        <PinPicker
          controller={controller}
          request={pinRequest}
          onDone={() => {
            setPinRequest(null);
          }}
        />
      )}
      {controller && (
        <>
          <SelectionBar controller={controller} onTokenOptions={onSelectionTokenOptions} />
          <TokenOptionsDialog
            campaign={campaign}
            controller={controller}
            id={tokenOptions}
            tab={tokenTab}
            onTabChange={setTokenTab}
            onClose={() => {
              setTokenOptions(null);
            }}
          />
          <SceneSettingsDialog campaign={campaign} sceneId={sceneId!} scene={controller.scene} />
        </>
      )}
    </>
  );
}

function useSceneCanvasInteractions(
  controller: SceneController | null,
  hostReference: React.RefObject<HTMLDivElement | null>,
) {
  const context = useCampaign();
  const fileReference = useRef<HTMLInputElement>(null);
  const importAt = useRef<Point | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [tokenOptions, setTokenOptions] = useState<string | null>(null);
  const [tokenTab, setTokenTab] = useState<"character" | "token">("token");
  const [dropping, setDropping] = useState(false);
  const [textEdit, setTextEdit] = useTextRequests(controller);
  const openTokenOptions = useCallback((id: string, tab: "character" | "token") => {
    setTokenTab(tab);
    setTokenOptions(id);
  }, []);
  const importImagesAt = useCallback((at: Point) => {
    importAt.current = at;
    fileReference.current?.click();
  }, []);
  useCanvasCommands(controller, { openTokenOptions, importImagesAt });
  const closeMenu = useCallback(() => {
    setMenu(null);
  }, []);

  function openMenuAt(x: number, y: number) {
    if (!controller) return;
    controller.cancelGesture();
    const at = controller.toWorld(x, y);
    const hit = controller.hitTest(at, true);
    if (hit && !controller.selection.value.includes(hit.id)) controller.select([hit.id]);
    if (!hit) controller.select([]);
    setMenu({
      x,
      y,
      items: menuFor(
        context,
        hit
          ? { kind: "selection", sceneId: controller.sceneId, ids: controller.selection.value }
          : { kind: "canvas", sceneId: controller.sceneId, at },
      ),
    });
  }
  const menuOpener = menuTrigger(openMenuAt);

  function onDoubleClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (!controller || context.tools.activeTool.value !== "select") return;
    const hit = controller.hitTest(controller.toWorld(event.clientX, event.clientY));
    if (hit?.type !== "token") return;
    const box = bounds([hit])!;
    const { camera } = controller.renderer;
    const host = hostReference.current!.getBoundingClientRect();
    setMorphOrigin(
      new DOMRect(
        host.left + box.x * camera.zoom + camera.x,
        host.top + box.y * camera.zoom + camera.y,
        box.w * camera.zoom,
        box.h * camera.zoom,
      ),
    );
    setTokenTab(hit.characterId ? "character" : "token");
    setTokenOptions(hit.id);
  }

  function onDragOver(event: ReactDragEvent) {
    if (!event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDropping(true);
  }

  function onDrop(event: ReactDragEvent) {
    setDropping(false);
    if (!controller || !event.dataTransfer?.files.length) return;
    event.preventDefault();
    void controller.importFiles(
      event.dataTransfer.files,
      controller.toWorld(event.clientX, event.clientY),
    );
  }

  const onSelectionTokenOptions = (id: string, from: Element) => {
    setMorphOrigin(from);
    setTokenTab("token");
    setTokenOptions(id);
  };

  return {
    ctx: context,
    fileRef: fileReference,
    importAt,
    dropping,
    setDropping,
    menu,
    tokenOptions,
    tokenTab,
    textEdit,
    setTextEdit,
    menuOpener,
    closeMenu,
    onDoubleClick,
    onDragOver,
    onDrop,
    onSelectionTokenOptions,
    setTokenTab,
    setTokenOptions,
  };
}

function SceneSettingsDialog({
  campaign,
  sceneId,
  scene,
}: {
  campaign: Campaign;
  sceneId: string;
  scene: SceneDocument;
}) {
  const context = useCampaign();
  const reference = useRef<HTMLDialogElement>(null);
  const view = useQuery(campaign.scenes, () => campaign.sceneViews().find((s) => s.id === sceneId));
  const isOpen = useQuery(context.canvas.sceneSettingsOpen);

  useEffect(() => {
    if (isOpen) openPopup(reference.current);
  }, [isOpen]);

  return (
    <Dialog
      dialogRef={reference}
      title={view ? `${view.name} Settings` : "Scene Settings"}
      onClose={() => {
        context.canvas.sceneSettingsOpen.set(false);
      }}
    >
      <SceneSettingsFields
        campaign={campaign}
        sceneId={sceneId}
        scene={scene}
        showHeading={false}
      />
    </Dialog>
  );
}
