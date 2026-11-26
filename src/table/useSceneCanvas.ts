import { useEffect, useEffectEvent, useRef, useState  } from "react";
import type {RefObject} from "react";
import { watch } from "../lib/store";
import { device } from "../platform/device";
import SceneController from "../scene/controller";
import type { TextRequest } from "../scene/gestures/types";
import SceneRenderer from "../scene/renderer";
import { SceneDoc as SceneDocument } from "../scene/sceneDoc";
import { formatDistance } from "../scene/measure";
import type { Campaign } from "../campaign/campaign";
import { tokenMarksSource } from "../features/combat/api";
import { listCharacters, systemOf, tokenStatsSource } from "../features/characters/api";
import useConstant from "../ui/useConstant";
import isTyping from "../ui/keys";
import { useCampaign  } from "../workspace/campaignContext";
import type {CampaignContext} from "../workspace/campaignContext";
import bindSceneDrops from "./sceneDrops";

/* The scene canvas's subscriptions: what the renderer and the scene controller are fed from the table, and what they feed back. */

/** The PixiJS renderer in `host`, kept current with the table's drops, token stats and condition marks. */
export function useSceneRenderer(campaign: Campaign, hostReference: RefObject<HTMLDivElement | null>) {
  const context = useCampaign();
  const renderer = useConstant(() => new SceneRenderer(context.blobs));
  const [ready, setReady] = useState(false);
  const lastDropFlash = useRef(0);

  useEffect(() => {
    if (!ready) return;
    return watch([context.canvas.sceneDropHighlight, context.canvas.sceneDropFlash], () => {
      renderer.setDropHighlight(context.canvas.sceneDropHighlight.value);
      const flash = context.canvas.sceneDropFlash.value;
      if (flash && flash.nonce !== lastDropFlash.current) {
        lastDropFlash.current = flash.nonce;
        renderer.flashToken(flash.tokenId);
      }
    });
  }, [context, ready, renderer]);

  useEffect(() => {
    void renderer.init(hostReference.current!).then(() => { setReady(true); });
    return () => { renderer.destroy(); };
  }, [renderer, hostReference]);

  // Keep linked tokens' stats current as characters change.
  useEffect(() => {
    if (!ready) return;
    const push = () => { renderer.setTokenStats(tokenStatsSource(campaign)); };
    push();
    const stopObserving = campaign.characters.observe(push);
    return () => { stopObserving(); };
  }, [ready, campaign, renderer]);

  // Condition pips on linked tokens, and the ring on whoever's turn it is.
  useEffect(() => {
    if (!ready) return;
    const push = () => { renderer.setTokenMarks(tokenMarksSource(campaign)); };
    push();
    const stopObservingCharacters = campaign.characters.observe(push);
    const stopObservingCombat = campaign.combat.observe(push);
    const stopObservingCombatants = campaign.combatants.observe(push);
    return () => {
      stopObservingCharacters();
      stopObservingCombat();
      stopObservingCombatants();
    };
  }, [ready, campaign, renderer]);

  return { renderer, ready };
}

/** Selecting a character's token opens that character's sheet. */
export function useSheetOnTokenSelect(campaign: Campaign, controller: SceneController | null) {
  const context = useCampaign();
  useEffect(() => {
    const ctl = controller;
    if (!ctl) return;
    let last = "";
    let first = true;
    return ctl.selection.subscribe(() => {
      const sel = ctl.selection.value;
      const selectedId = sel.length === 1 ? sel[0] : undefined;
      const element = selectedId ? ctl.element(selectedId) : null;
      const id = element?.type === "token" ? element.characterId : undefined;
      const fresh = id && sel[0] !== last && !first && campaign.characters.has(id);
      last = sel[0] ?? "";
      first = false;
      if (!fresh) return;
      context.links.openCharacter(id);
    });
  }, [context, controller, campaign]);
}

/** Light and sight: the scene's lighting, the GM's walls and lights, and sight through a player's own tokens. */
export function useLighting(campaign: Campaign, controller: SceneController | null) {
  // Light and sight: the scene's lighting, the GM's walls and lights, and for
  // a player in a scene with vision on, sight through their own characters' tokens.
  useEffect(() => {
    const ctl = controller;
    if (!ctl) return;
    const push = () => {
      const gm = campaign.isGm();
      ctl.setGm(gm);
      const lighting = ctl.scene.lighting();
      const mine = new Set(
        listCharacters(campaign).flatMap((c) =>
          c.kind === "pc" && c.owner === device.value.id ? [c.id] : [],
        ),
      );
      const eyes = ctl
        .allElements()
        .flatMap((element) => (element.type === "token" && mine.has(element.characterId ?? "") ? [element.id] : []));
      // A player with no tokens here sees the whole scene, rather than nothing.
      ctl.renderer.setLighting(lighting, !gm && lighting.vision && eyes.length > 0 ? eyes : null, gm);
    };
    push();
    const stopWatchingRevision = watch([ctl.revision], push);
    const stopObservingSettings = ctl.scene.settings.observe(push);
    const stopObservingCharacters = campaign.characters.observe(push);
    const stopObservingMembers = campaign.members.observe(push);
    return () => {
      stopWatchingRevision();
      stopObservingSettings();
      stopObservingCharacters();
      stopObservingMembers();
    };
  }, [controller, campaign]);
}

/** Opens the scene's subdocument and drives it, swapping on scene change. */
export function useSceneController(
  campaign: Campaign,
  renderer: SceneRenderer,
  ready: boolean,
  sceneId: string | null,
  hostReference: RefObject<HTMLDivElement | null>,
) {
  const context = useCampaign();
  const [controller, setController] = useState<SceneController | null>(null);
  useEffect(() => {
    if (!ready || !sceneId) return;
    const subdoc = campaign.sceneSubdoc(sceneId);
    if (!subdoc) return;
    let cancelled = false;
    let scene: SceneDocument | null = null;
    let ctl: SceneController | null = null;
    let unbind: (() => void) | null = null;
    void SceneDocument.open(subdoc, {
      type: campaign.defaults().gridType,
      ...systemOf(campaign).scene,
    }).then((s) => {
      scene = s;
      if (cancelled) { s.destroy(); return; }
      ctl = new SceneController(
        s,
        renderer,
        hostReference.current!,
        sceneId,
        context.tools,
        () => campaign.defaults(),
        campaign.presence,
      );
      ctl.start();
      setController(ctl);
      unbind = bindSceneDrops(context, campaign, ctl, hostReference.current!);
      // Handy for poking at the scene from the console while developing.
      if (import.meta.env.DEV) Object.assign(globalThis, { mamScene: ctl });
    });
    return () => {
      cancelled = true;
      ctl?.stop();
      setController(null);
      unbind?.();
      renderer.setElements([]);
      scene?.destroy();
    };
  }, [context, ready, sceneId, campaign, renderer, hostReference]);
  return controller;
}

/** Targeting for an action: hand the request to the scene, and its choices and an area's placement back. */
export function useSceneTargeting(context: CampaignContext, controller: SceneController | null) {
  useEffect(
    () =>
      watch([context.canvas.targetPick], () => {
        controller?.setTargetMode(context.canvas.targetPick.value);
        if (!context.canvas.targetPick.value) context.canvas.placedArea.set(null);
      }),
    [context, controller],
  );
  useEffect(() => {
    if (!controller) {
      context.canvas.chosenTargets.set([]);
      return;
    }
    return watch([controller.targets, controller.revision], () => {
      const {grid} = controller.renderer;
      context.canvas.chosenTargets.set(controller.targetDetails());
      context.canvas.sceneDistance.set((d) => formatDistance(grid, d));
    });
  }, [context, controller]);

  // An action's area: place it, then target the tokens it covers (not the actor's, for areas that start from them).
  useEffect(() => {
    if (!controller) return;
    return watch([context.canvas.areaRequest], () => {
      const request = context.canvas.areaRequest.value;
      if (!request) { controller.placeArea(null); return; }
      const {grid} = controller.renderer;
      const px = (units: number) => (units / (grid.unit || 1)) * grid.size;
      const { area } = request;
      const shape =
        area.shape === "cube"
          ? "rect"
          : area.shape === "cone"
            ? "cone"
            : area.shape === "line"
              ? "line"
              : "circle";
      const fromActor =
        area.shape === "cone" || area.shape === "line" || area.shape === "emanation";
      controller.placeArea({
        shape,
        length: px(area.size),
        width: px(area.width ?? grid.unit),
        onPlaced: (placed) => {
          if (context.canvas.areaRequest.value === request) context.canvas.areaRequest.set(null);
          if (!placed) return;
          // A new area replaces the last one placed for this action.
          const before = context.canvas.placedArea.value;
          if (before) controller.scene.remove([before]);
          context.canvas.placedArea.set(placed.id);
          const actorTokens = new Set(
            controller
              .allElements()
              .flatMap((element) =>
                element.type === "token" && request.actor && element.characterId === request.actor ? [element.id] : [],
              ),
          );
          const covered = placed.covered.filter((id) => !(fromActor && actorTokens.has(id)));
          controller.setTargets(
            context.canvas.targetPick.value?.max
              ? covered.slice(0, context.canvas.targetPick.value.max)
              : covered,
          );
        },
      });
    });
  }, [context, controller]);
}

/** Typed text on the map: the request to edit some, until it's done. */
export function useTextRequests(controller: SceneController | null) {
  const [request, setRequest] = useState<TextRequest | null>(null);
  useEffect(() => controller?.handleTextRequests(setRequest), [controller]);
  return [request, setRequest] as const;
}

/** Keyboard shortcuts and paste for the scene, unless a field or dialog has the keyboard. */
export function useSceneShortcuts(controller: SceneController | null) {
  const onDown = useEffectEvent((e: KeyboardEvent) => {
    // Pop-ups are non-modal: only keys aimed inside one stay with it.
    const blocked = (event: KeyboardEvent) =>
      isTyping(event.target) || !!(event.target as Element).closest?.("dialog");
    if (e.defaultPrevented || blocked(e)) return;
    // Space only pans when nothing focusable would otherwise take it.
    if (e.key === " " && document.activeElement instanceof HTMLButtonElement) return;
    if (controller?.onKeyDown(e)) e.preventDefault();
  });
  const onUp = useEffectEvent((e: KeyboardEvent) => controller?.onKeyUp(e));
  const onBlur = useEffectEvent(() => controller?.onBlur());
  const onPaste = useEffectEvent((e: ClipboardEvent) => {
    const ctl = controller;
    const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
    if (!ctl || files.length === 0 || isTyping(e.target)) return;
    e.preventDefault();
    void ctl.importFiles(files, ctl.centre());
  });
  useEffect(() => {
    const onDownListener = (e: KeyboardEvent) => {
      onDown(e);
    };
    const onUpListener = (e: KeyboardEvent) => onUp(e);
    const onBlurListener = () => onBlur();
    const onPasteListener = (e: ClipboardEvent) => { onPaste(e); };
    globalThis.addEventListener("keydown", onDownListener);
    globalThis.addEventListener("keyup", onUpListener);
    window.addEventListener("blur", onBlurListener);
    document.addEventListener("paste", onPasteListener);
    return () => {
      globalThis.removeEventListener("keydown", onDownListener);
      globalThis.removeEventListener("keyup", onUpListener);
      window.removeEventListener("blur", onBlurListener);
      document.removeEventListener("paste", onPasteListener);
    };
  }, []);
}
