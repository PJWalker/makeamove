import { menuTrigger } from "../ui/menuTrigger";
import { tokenMarksSource } from "../features/combat/api";
import { bounds } from "../scene/geometry";
import { toScreen } from "../scene/camera";
import { setMorphOrigin } from "../ui/morph";
import { openPopup } from "../ui/popup";
import { watch } from "../lib/store";
import { device } from "../platform/device";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { SceneController, type TextRequest } from "../scene/controller";
import { SceneRenderer } from "../scene/renderer";
import { SceneDoc } from "../scene/sceneDoc";
import type { Point } from "../scene/grid";
import { importImage } from "../media/images";
import { TOKEN_STYLES, type SceneElement } from "../scene/types";
import type { Campaign } from "../campaign/campaign";
import {
  canEdit,
  getCharacter,
  listCharacters,
  systemOf,
  tokenStatsSource,
} from "../features/characters/api";
import { tokenName } from "../features/characters/templates";
import { CharacterSheet } from "./sheets";
import { useQuery } from "../ui/useQuery";
import { useConstant } from "../ui/useConstant";
import { getEntityGraphic } from "../workspace/entityGraphics";
import { EntityGraphicView } from "../ui/EntityGraphic";
import type { EntityGraphic } from "../media/images";
import { ColourPicker } from "../ui/ColourPicker";
import { Button } from "../ui/Button";
import { CommitInput } from "../ui/CommitInput";
import { SelectionBar } from "./SelectionBar";
import { isTyping } from "../ui/keys";
import { PopupTabs } from "../ui/PopupTabs";
import { Segmented } from "../ui/Segmented";
import { Dialog } from "../workspace/Dialog";
import { SceneSettingsFields } from "./SceneSettingsFields";
import { dropOn, dropTargetAt, setDropCursor } from "../workspace/entityDrag";
import { itemDefinitionForToken, itemTokenEntity } from "../workspace/dragEntities";
import { formatDistance } from "../scene/measure";
import { linkProxy } from "../workspace/linkProxy";
import { ContextMenu, type MenuItem } from "../ui/ContextMenu";
import { useCampaign } from "../workspace/campaignContext";
import { copyCharacter } from "../workspace/commands/characters";
import { menuFor } from "../workspace/commands/views";

/**
 * The scene canvas: hosts the PixiJS renderer and wires it to the active
 * scene.
 */
export default function SceneCanvas({
  campaign,
  sceneId,
}: {
  campaign: Campaign;
  sceneId: string | null;
}) {
  const ctx = useCampaign();
  const hostRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const importAt = useRef<Point | null>(null);
  const renderer = useConstant(() => new SceneRenderer(ctx.blobs));
  const [ready, setReady] = useState(false);
  const [controller, setController] = useState<SceneController | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [tokenOptions, setTokenOptions] = useState<string | null>(null);
  /** Which tab the token pop-up opens on. */
  const [tokenTab, setTokenTab] = useState<"character" | "token">("token");
  const [dropping, setDropping] = useState(false);
  const lastDropFlash = useRef(0);

  useEffect(() => {
    if (!ready) return;
    return watch([ctx.canvas.sceneDropHighlight, ctx.canvas.sceneDropFlash], () => {
      renderer.setDropHighlight(ctx.canvas.sceneDropHighlight.value);
      const flash = ctx.canvas.sceneDropFlash.value;
      if (flash && flash.nonce !== lastDropFlash.current) {
        lastDropFlash.current = flash.nonce;
        renderer.flashToken(flash.tokenId);
      }
    });
  }, [ctx, ready, renderer]);

  // Selecting a character's token goes to that character's sheet.
  useEffect(() => {
    const ctl = controller;
    if (!ctl) return;
    let last = "";
    let first = true;
    return ctl.selection.subscribe(() => {
      const sel = ctl.selection.value;
      const selectedId = sel.length === 1 ? sel[0] : undefined;
      const el = selectedId ? ctl.element(selectedId) : null;
      const id = el?.type === "token" ? el.characterId : undefined;
      const fresh = id && sel[0] !== last && !first && campaign.characters.has(id);
      last = sel[0] ?? "";
      first = false;
      if (!fresh) return;
      ctx.links.openCharacter(id);
    });
  }, [ctx, controller, campaign]);

  useEffect(() => {
    void renderer.init(hostRef.current!).then(() => setReady(true));
    return () => renderer.destroy();
  }, [renderer]);

  // Keep linked tokens' stats current as characters change.
  useEffect(() => {
    if (!ready) return;
    const push = () => renderer.setTokenStats(tokenStatsSource(campaign));
    push();
    const stopObserving = campaign.characters.observe(push);
    return () => stopObserving();
  }, [ready, campaign, renderer]);

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
        .flatMap((el) => (el.type === "token" && mine.has(el.characterId ?? "") ? [el.id] : []));
      // A player with no tokens here sees the whole scene, rather than nothing.
      renderer.setLighting(lighting, !gm && lighting.vision && eyes.length ? eyes : null, gm);
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
  }, [controller, campaign, renderer]);

  // Condition pips on linked tokens, and the ring on whoever's turn it is.
  useEffect(() => {
    if (!ready) return;
    const push = () => renderer.setTokenMarks(tokenMarksSource(campaign));
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

  // Open the scene's subdocument and drive it, swapping on scene change.
  useEffect(() => {
    if (!ready || !sceneId) return;
    const subdoc = campaign.sceneSubdoc(sceneId);
    if (!subdoc) return;
    let cancelled = false;
    let scene: SceneDoc | null = null;
    let ctl: SceneController | null = null;
    void SceneDoc.open(subdoc, {
      type: campaign.defaults().gridType,
      ...systemOf(campaign).scene,
    }).then((s) => {
      scene = s;
      if (cancelled) return s.destroy();
      ctl = new SceneController(
        s,
        renderer,
        hostRef.current!,
        sceneId,
        ctx.tools,
        () => campaign.defaults(),
        campaign.presence,
      );
      ctl.start();
      setController(ctl);
      ctx.canvas.tokenDrop.set((x, y, spec) => {
        // A template's token is a new copy of it, with a name of its own.
        if (spec.characterId) {
          const c = getCharacter(campaign, spec.characterId);
          if (c?.template) {
            const name = tokenName(c, c.template, ctl!.tokenNames());
            const copy = ctx.execute(copyCharacter, { template: c.id, name });
            if (copy) spec = { ...spec, name, characterId: copy };
          }
          ctl!.addCharacterToken(
            ctl!.toWorld(x, y),
            spec as Required<Pick<typeof spec, "characterId" | "name">> & typeof spec,
          );
        } else {
          ctl!.addToken(ctl!.toWorld(x, y), spec.name, spec);
        }
        return true;
      });
      ctx.canvas.sceneCharacterAt.set((x, y) => {
        const hit = ctl!.hitTest(ctl!.toWorld(x, y), true, true);
        if (hit?.type !== "token" || !hit.characterId) return null;
        const character = getCharacter(campaign, hit.characterId);
        const bounds = hostRef.current!.getBoundingClientRect();
        const screen = toScreen(renderer.camera, hit);
        return {
          characterId: hit.characterId,
          tokenId: hit.id,
          editable: !!character && canEdit(campaign, character),
          center: { x: bounds.left + screen.x, y: bounds.top + screen.y },
        };
      });
      ctl.onItemTokenDragMove = (token, event) => {
        if (!token) {
          document.documentElement.classList.remove("is-reordering");
          setDropCursor(null);
          ctx.canvas.sceneDropHighlight.set(null);
          return;
        }
        const dragged = itemTokenEntity(ctx, token);
        const target = dragged
          ? dropTargetAt(ctx.canvas, event.clientX, event.clientY, dragged)
          : null;
        document.documentElement.classList.add("is-reordering");
        setDropCursor(!!target);
        ctx.canvas.sceneDropHighlight.set(target?.tokenId ?? null);
      };
      ctl.onItemTokenDrop = (token, event) => {
        const dragged = itemTokenEntity(ctx, token);
        const target = dragged
          ? dropTargetAt(ctx.canvas, event.clientX, event.clientY, dragged)
          : null;
        document.documentElement.classList.remove("is-reordering");
        setDropCursor(null);
        ctx.canvas.sceneDropHighlight.set(null);
        if (!target) {
          const overCanvas =
            hostRef.current?.contains(document.elementFromPoint(event.clientX, event.clientY)) ??
            false;
          if (!overCanvas) {
            ctl!.renderer.previews.delete(token.id);
            ctl!.renderer.invalidate("previews", "overlay");
            return true;
          }
          return false;
        }
        if (target.element.matches(".scene-canvas") && !target.tokenId) return false;
        const destination = target.tokenCenter ?? { x: event.clientX, y: event.clientY };
        ctl!.animateItemTokenDrop(token.id, destination.x, destination.y, () => {
          dropOn(ctx.canvas, target, dragged!, event.clientX, event.clientY);
          ctl!.scene.remove([token.id]);
          ctl!.selection.value = ctl!.selection.value.filter((id) => id !== token.id);
        });
        return true;
      };
      // A duplicated copy's token gets a copy of its own, from the same template.
      ctl.afterDuplicate = (ids) => {
        const patches: [string, Partial<SceneElement>][] = [];
        for (const id of ids) {
          const el = s.get(id);
          const copy = el?.type === "token" ? getCharacter(campaign, el.characterId) : undefined;
          const template = copy?.base ? getCharacter(campaign, copy.base) : undefined;
          if (!template?.template) continue;
          const name = tokenName(template, template.template, ctl!.tokenNames());
          const characterId = ctx.execute(copyCharacter, { template: template.id, name });
          if (characterId) patches.push([id, { name, characterId }]);
        }
        if (patches.length) s.update(patches);
      };
      // Handy for poking at the scene from the console while developing.
      if (import.meta.env.DEV) Object.assign(window, { mamScene: ctl });
    });
    return () => {
      cancelled = true;
      ctl?.stop();
      setController(null);
      ctx.canvas.tokenDrop.set(null);
      ctx.canvas.sceneCharacterAt.set(null);
      ctx.canvas.sceneDropHighlight.set(null);
      if (ctl) {
        ctl.onItemTokenDragMove = null;
        ctl.onItemTokenDrop = null;
      }
      renderer.setElements([]);
      scene?.destroy();
    };
  }, [ctx, ready, sceneId, campaign, renderer]);

  useEffect(() => {
    if (!controller) {
      ctx.canvas.activeMapColour.set(null);
      ctx.canvas.canvasCommands.set(null);
      return;
    }
    return watch([controller.mapColour], () => {
      const colour = controller.mapColour.value;
      ctx.canvas.activeMapColour.set(colour);
      ctx.canvas.seenMapColours.set({
        ...ctx.canvas.seenMapColours.value,
        [controller.sceneId]: colour,
      });
      ctx.canvas.canvasCommands.set({
        sceneId: controller.sceneId,
        scene: controller.scene,
        controller,
        tokenOptions: (id, tab) => {
          setTokenTab(tab);
          setTokenOptions(id);
        },
        importImagesAt: (at) => {
          importAt.current = at;
          fileRef.current?.click();
        },
      });
    });
  }, [ctx, controller]);
  // The scene's undo steps are in the player's history while it's open.
  useEffect(
    () => (controller ? ctx.history.track(controller.scene.undo) : undefined),
    [ctx, controller],
  );
  useEffect(() => () => ctx.canvas.canvasCommands.set(null), [ctx]);

  // Targeting for an action: hand the request to the scene, and its choices back.
  useEffect(
    () =>
      watch([ctx.canvas.targetPick], () => {
        controller?.setTargetMode(ctx.canvas.targetPick.value);
        if (!ctx.canvas.targetPick.value) ctx.canvas.placedArea.set(null);
      }),
    [ctx, controller],
  );
  useEffect(() => {
    if (!controller) {
      ctx.canvas.chosenTargets.set([]);
      return;
    }
    return watch([controller.targets, controller.revision], () => {
      const grid = controller.renderer.grid;
      ctx.canvas.chosenTargets.set(controller.targetDetails());
      ctx.canvas.sceneDistance.set((d) => formatDistance(grid, d));
    });
  }, [ctx, controller]);

  // An action's area: place it, then target the tokens it covers (not the actor's, for areas that start from them).
  useEffect(() => {
    if (!controller) return;
    return watch([ctx.canvas.areaRequest], () => {
      const req = ctx.canvas.areaRequest.value;
      if (!req) return controller.placeArea(null);
      const grid = controller.renderer.grid;
      const px = (units: number) => (units / (grid.unit || 1)) * grid.size;
      const { area } = req;
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
          if (ctx.canvas.areaRequest.value === req) ctx.canvas.areaRequest.set(null);
          if (!placed) return;
          // A new area replaces the last one placed for this action.
          const before = ctx.canvas.placedArea.value;
          if (before) controller.scene.remove([before]);
          ctx.canvas.placedArea.set(placed.id);
          const actorTokens = new Set(
            controller
              .allElements()
              .flatMap((el) =>
                el.type === "token" && req.actor && el.characterId === req.actor ? [el.id] : [],
              ),
          );
          const covered = placed.covered.filter((id) => !(fromActor && actorTokens.has(id)));
          controller.setTargets(
            ctx.canvas.targetPick.value?.max
              ? covered.slice(0, ctx.canvas.targetPick.value.max)
              : covered,
          );
        },
      });
    });
  }, [ctx, controller]);

  // Text: typed in a box where it goes on the map.
  const [textEdit, setTextEdit] = useState<TextRequest | null>(null);
  useEffect(() => controller?.handleTextRequests(setTextEdit), [controller]);
  const commitText = (value: string) => {
    const req = textEdit;
    setTextEdit(null);
    if (req) controller?.putText(req.at, value, req.id);
  };

  // Keyboard shortcuts, unless a field or dialog has the keyboard.
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
    if (!ctl || !files.length || isTyping(e.target)) return;
    e.preventDefault();
    void ctl.importFiles(files, ctl.centre());
  });
  useEffect(() => {
    const onDownListener = (e: KeyboardEvent) => {
      onDown(e);
    };
    const onUpListener = (e: KeyboardEvent) => onUp(e);
    const onBlurListener = () => onBlur();
    const onPasteListener = (e: ClipboardEvent) => onPaste(e);
    window.addEventListener("keydown", onDownListener);
    window.addEventListener("keyup", onUpListener);
    window.addEventListener("blur", onBlurListener);
    document.addEventListener("paste", onPasteListener);
    return () => {
      window.removeEventListener("keydown", onDownListener);
      window.removeEventListener("keyup", onUpListener);
      window.removeEventListener("blur", onBlurListener);
      document.removeEventListener("paste", onPasteListener);
    };
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);

  /** Open the right-click menu for whatever is at a client point. */
  function openMenuAt(x: number, y: number) {
    const ctl = controller;
    if (!ctl) return;
    ctl.cancelGesture();
    const at = ctl.toWorld(x, y);
    const hit = ctl.hitTest(at, true);
    if (hit && !ctl.selection.value.includes(hit.id)) ctl.select([hit.id]);
    if (!hit) ctl.select([]);
    setMenu({
      x,
      y,
      items: menuFor(
        ctx,
        hit
          ? { kind: "selection", sceneId: ctl.sceneId, ids: ctl.selection.value }
          : { kind: "canvas", sceneId: ctl.sceneId, at },
      ),
    });
  }
  // Opens on the right-button press on every platform (see ui/menuTrigger.ts).
  const menuOpener = menuTrigger(openMenuAt);

  /** Double-clicking a token opens its options. */
  function onDoubleClick(e: ReactMouseEvent<HTMLDivElement>) {
    const ctl = controller;
    if (!ctl || ctx.tools.activeTool.value !== "select") return;
    const hit = ctl.hitTest(ctl.toWorld(e.clientX, e.clientY));
    if (hit?.type !== "token") return;
    // Grow the options out of the token itself.
    const b = bounds([hit])!;
    const cam = ctl.renderer.camera;
    const host = hostRef.current!.getBoundingClientRect();
    setMorphOrigin(
      new DOMRect(
        host.left + b.x * cam.zoom + cam.x,
        host.top + b.y * cam.zoom + cam.y,
        b.w * cam.zoom,
        b.h * cam.zoom,
      ),
    );
    // A token with a character opens on its sheet.
    setTokenTab(hit.characterId ? "character" : "token");
    setTokenOptions(hit.id);
  }

  function onDragOver(e: ReactDragEvent) {
    if (!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDropping(true);
  }

  function onDrop(e: ReactDragEvent) {
    setDropping(false);
    const ctl = controller;
    if (!ctl || !e.dataTransfer?.files.length) return;
    e.preventDefault();
    void ctl.importFiles(e.dataTransfer.files, ctl.toWorld(e.clientX, e.clientY));
  }

  return (
    <>
      <div
        ref={hostRef}
        className="scene-canvas"
        data-drop={dropping}
        {...menuOpener}
        onDoubleClick={onDoubleClick}
        onDragOver={onDragOver}
        onDragLeave={() => setDropping(false)}
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
          const files = e.currentTarget.files;
          if (ctl && files?.length)
            void ctl.importFiles([...files], importAt.current ?? ctl.centre());
          e.currentTarget.value = "";
        }}
      />
      {menu && <ContextMenu {...menu} onClose={closeMenu} />}
      {textEdit && (
        <input
          key={`${textEdit.screen.x},${textEdit.screen.y}`}
          className="input scene-text-input"
          style={{
            left: `${textEdit.screen.x}px`,
            top: `${textEdit.screen.y}px`,
          }}
          aria-label="Text"
          defaultValue={textEdit.text ?? ""}
          ref={(el) => void (el && requestAnimationFrame(() => el.focus()))}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitText(e.currentTarget.value);
            else if (e.key === "Escape") setTextEdit(null);
            e.stopPropagation();
          }}
          onBlur={(e) => textEdit && commitText(e.currentTarget.value)}
        />
      )}
      {controller && (
        <>
          <SelectionBar
            controller={controller}
            onTokenOptions={(id, from) => {
              setMorphOrigin(from);
              setTokenTab("token");
              setTokenOptions(id);
            }}
          />
          <TokenOptionsDialog
            campaign={campaign}
            controller={controller}
            id={tokenOptions}
            tab={tokenTab}
            onTabChange={setTokenTab}
            onClose={() => setTokenOptions(null)}
          />
          <SceneSettingsDialog campaign={campaign} sceneId={sceneId!} scene={controller.scene} />
        </>
      )}
    </>
  );
}

/** Name, style and colour of a token. Each change applies as soon as it's made. */
function TokenOptionsDialog({
  campaign,
  controller,
  id,
  tab,
  onTabChange,
  onClose,
}: {
  campaign: Campaign;
  controller: SceneController;
  id: string | null;
  tab: "character" | "token";
  onTabChange: (tab: "character" | "token") => void;
  onClose: () => void;
}) {
  const ctx = useCampaign();
  const ref = useRef<HTMLDialogElement>(null);
  const scene = controller.scene;
  // The table stays usable while this is open, so the token may change or be deleted.
  const tokenMap = useQuery(scene.elements, () => (id ? scene.elements.get(id) : undefined));
  const el = useQuery(tokenMap, () => (id && tokenMap ? scene.get(id) : null));
  const token = el?.type === "token" ? el : null;
  const system = systemOf(campaign);
  const item = token ? itemDefinitionForToken(campaign, token) : undefined;
  const itemToken = !!item;
  const fileRef = useRef<HTMLInputElement>(null);
  const grid = controller.renderer.grid;
  const characters = useQuery(campaign.characters, () => listCharacters(campaign));
  const linked = useQuery(campaign.characters, () => getCharacter(campaign, token?.characterId));

  useEffect(() => {
    if (id) openPopup(ref.current);
  }, [id]);
  useEffect(() => {
    if (id && !token) ref.current?.close();
  }, [id, token]);

  const update = (patch: Parameters<SceneController["updateToken"]>[1], cells?: number) => {
    if (id) controller.updateToken(id, patch, cells);
  };

  // A template's token shows the template it's a copy of.
  const characterId = linked?.base ?? token?.characterId ?? "";
  const style = token?.style ?? "disc";
  const colour = token?.colour ?? "#000000";
  const image = token?.image;
  // What the token shows: its own image, else its character's graphic.
  const inherited = !itemToken && !!characterId;
  const sheetGraphic = inherited ? getEntityGraphic(campaign, "character", characterId) : undefined;
  const previewGraphic: EntityGraphic | undefined = image
    ? { kind: "image", image }
    : (sheetGraphic ?? token?.graphic);
  const plainLook = style === "plain" && previewGraphic?.kind === "image";
  // The first size as wide as the token, or none if it's been resized by hand.
  const cells = token ? Math.max(token.w, token.h) / grid.size : 0;
  const size = system.sizes.find((z) => Math.abs(z.cells - cells) < 0.01)?.id ?? "";

  /**
   * Link the token to `chosen`: a template makes it a new copy, unless it's
   * already a copy of that template. Linking an unnamed token names it after
   * the character.
   */
  const link = (chosen: string) => {
    if (!token) return;
    if (!chosen) return update({ characterId: undefined });
    if (linked?.base === chosen) return update({ characterId: linked.id });
    const c = characters.find((k) => k.id === chosen);
    if (!c) return;
    const name = token.name.trim();
    if (!c.template) return update({ characterId: chosen, ...(name ? {} : { name: c.name }) });
    const copyName = name || tokenName(c, c.template, controller.tokenNames());
    const copy = ctx.execute(copyCharacter, { template: chosen, name: copyName });
    if (copy) update({ characterId: copy, name: copyName });
  };

  return (
    <Dialog
      dialogRef={ref}
      title={linked ? linked.name : (item?.name ?? token?.name ?? "Token options")}
      onClose={onClose}
      {...(linked ? { proxy: linkProxy(ctx, "character", linked.id, linked.name) } : {})}
    >
      {linked && (
        <PopupTabs
          tabs={[
            { id: "character", label: "Character" },
            { id: "token", label: "Token" },
          ]}
          value={tab}
          onChange={onTabChange}
        />
      )}
      {linked && tab === "character" && (
        <div className="popup-sheet sheet-panel">
          <CharacterSheet campaign={campaign} system={system} c={linked} />
        </div>
      )}
      {token && (
        <div hidden={!!linked && tab === "character"} className="dialog-form">
          <NameField key={token.id} value={token.name} onCommit={(name) => update({ name })} />
          {!itemToken && (
            <label className="field">
              Character
              <select
                className="input"
                value={characterId}
                onChange={(e) => link(e.currentTarget.value)}
              >
                <option value="">None</option>
                {characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <span className="muted">
                The game system decides which of its stats show on the token.
              </span>
            </label>
          )}
          <div className="field">
            Image
            <span className="token-image-row">
              <span
                className="token-image-preview"
                data-style={previewGraphic?.kind === "image" ? style : "disc"}
                style={{ "--token-colour": colour }}
              >
                <EntityGraphicView graphic={previewGraphic} size={64} />
              </span>
              <Button onClick={() => fileRef.current?.click()}>
                {inherited ? "Override…" : image ? "Change…" : "Choose…"}
              </Button>
              {image && (
                <Button variant="ghost" onClick={() => update({ image: undefined })}>
                  {inherited ? "Clear Override" : "Remove"}
                </Button>
              )}
            </span>
            {inherited && (
              <span className="muted">
                Uses the graphic from the character sheet unless overridden here.
              </span>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                e.currentTarget.value = "";
                if (file)
                  void importImage(file)
                    .then((image) => update({ image }))
                    .catch(() => {});
              }}
            />
          </div>
          <label className="field">
            Size
            <select
              className="input"
              value={size}
              onChange={(e) =>
                update({}, system.sizes.find((z) => z.id === e.currentTarget.value)?.cells)
              }
            >
              {!size && <option value="">As drawn</option>}
              {system.sizes.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name} ({z.cells === 0.5 ? "½" : z.cells} {z.cells > 1 ? "cells" : "cell"})
                </option>
              ))}
            </select>
          </label>
          <div className="field">
            Show
            <label className="check">
              <input
                type="checkbox"
                checked={!token.hideName}
                onChange={(e) => update({ hideName: e.currentTarget.checked ? undefined : true })}
              />
              Name under the token
            </label>
          </div>
          <div className="field">
            Style
            <Segmented
              label="Token style"
              value={style}
              options={TOKEN_STYLES}
              onChange={(style) => update({ style })}
            />
          </div>
          <div className="field colour-field" data-disabled={plainLook}>
            Background and border
            <span className="colour-row">
              <ColourPicker
                label="Background and border"
                alpha
                value={colour}
                disabled={plainLook}
                onChange={(next) => update({ colour: next })}
              />
              <span className="colour-hex">{colour}</span>
            </span>
          </div>
        </div>
      )}
    </Dialog>
  );
}

/** A token's name field: it commits when it loses focus or on Enter. */
function NameField({ value, onCommit }: { value: string; onCommit: (value: string) => void }) {
  return (
    <label className="field">
      Name
      <CommitInput value={value} autoFocus onCommit={onCommit} />
    </label>
  );
}

function SceneSettingsDialog({
  campaign,
  sceneId,
  scene,
}: {
  campaign: Campaign;
  sceneId: string;
  scene: SceneDoc;
}) {
  const ctx = useCampaign();
  const ref = useRef<HTMLDialogElement>(null);
  const view = useQuery(campaign.scenes, () => campaign.sceneViews().find((s) => s.id === sceneId));
  const isOpen = useQuery(ctx.canvas.sceneSettingsOpen);

  useEffect(() => {
    if (isOpen) openPopup(ref.current);
  }, [isOpen]);

  return (
    <Dialog
      dialogRef={ref}
      title={view ? `${view.name} settings` : "Scene settings"}
      onClose={() => ctx.canvas.sceneSettingsOpen.set(false)}
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
