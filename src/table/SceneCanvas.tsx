import { menuTrigger } from "../ui/menuTrigger";
import { addTokens, combatantForToken, hasCombat, tokenMarksSource } from "../features/combat/api";
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
import { SceneController } from "../scene/controller";
import { SceneRenderer } from "../scene/renderer";
import { activeTool } from "../scene/tools";
import { SceneDoc } from "../scene/sceneDoc";
import type { Point } from "../scene/grid";
import { importImage } from "../scene/images";
import {
  isPlainToken,
  TOKEN_STYLES,
  type BlobRef,
  type SceneElement,
  type TokenStyle,
} from "../scene/types";
import type { Campaign } from "../campaign/campaign";
import {
  canEdit,
  createCopy,
  getCharacter,
  listCharacters,
  selectCharacter,
  systemOf,
  tokenStatsSource,
} from "../features/characters/api";
import { tokenName } from "../features/characters/templates";
import { CharacterSheet } from "./sheets";
import { useY } from "../ui/useY";
import { BlobImage } from "../ui/BlobImage";
import { Button } from "../ui/Button";
import {
  IconAdd,
  IconDelete,
  IconDuplicate,
  IconFit,
  IconGrid,
  IconImage,
  IconLayers,
  IconLock,
  IconMap,
  IconRedo,
  IconRename,
  IconToBack,
  IconToFront,
  IconToken,
  IconCombat,
  IconLight,
  IconWall,
  IconUndo,
  IconUnlock,
} from "../ui/icons";
import { isTyping, MOD } from "../ui/keys";
import { PopupTabs } from "../ui/PopupTabs";
import { Segmented } from "../ui/Segmented";
import { Dialog } from "./CampaignDialogs";
import { SceneSettingsFields } from "./SceneSettingsFields";
import { showPanel } from "./panelLayout";
import {
  dropOn,
  dropTargetAt,
  itemDefinitionForToken,
  itemTokenEntity,
  setDropCursor,
} from "./entityDrag";
import {
  activeMapColour,
  canvasCommands,
  chosenTargets,
  areaRequest,
  placedArea,
  sceneDistance,
  sceneSettingsOpen,
  seenMapColours,
  targetPick,
  tokenDrop,
  sceneCharacterAt,
  sceneDropFlash,
  sceneDropHighlight,
} from "./canvasState";
import { formatDistance } from "../scene/measure";
import { linkProxy } from "./LinkChip";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { useValue } from "../ui/useValue";

/**
 * The scene canvas: hosts the PixiJS renderer and wires it to the active
 * scene. Loaded lazily, so PixiJS stays out of the lobby's bundle.
 */
export default function SceneCanvas({
  campaign,
  sceneId,
}: {
  campaign: Campaign;
  sceneId: string | null;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const importAt = useRef<Point | null>(null);
  const [renderer] = useState(() => new SceneRenderer());
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
    return watch([sceneDropHighlight, sceneDropFlash], () => {
      renderer.setDropHighlight(sceneDropHighlight.value);
      const flash = sceneDropFlash.value;
      if (flash && flash.nonce !== lastDropFlash.current) {
        lastDropFlash.current = flash.nonce;
        renderer.flashToken(flash.tokenId);
      }
    });
  }, [ready, renderer]);

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
      selectCharacter(campaign, id);
      showPanel("characters");
    });
  }, [controller, campaign]);

  useEffect(() => {
    renderer.init(hostRef.current!).then(() => setReady(true));
    return () => renderer.destroy();
  }, [renderer]);

  // Keep linked tokens' stats current as characters change.
  useEffect(() => {
    if (!ready) return;
    const push = () => renderer.setTokenStats(tokenStatsSource(campaign));
    push();
    campaign.characters.observeDeep(push);
    return () => campaign.characters.unobserveDeep(push);
  }, [ready, campaign, renderer]);

  // Light and sight: the scene's lighting, the GM's walls and lights, and for
  // a player in a scene with vision on, sight through their own characters' tokens.
  useEffect(() => {
    const ctl = controller;
    if (!ctl) return;
    const push = () => {
      const gm = campaign.isGm();
      ctl.gm = gm;
      const lighting = ctl.scene.lighting();
      const mine = new Set(
        listCharacters(campaign)
          .filter((c) => c.kind === "pc" && c.owner === device.value.id)
          .map((c) => c.id),
      );
      const eyes = ctl
        .allElements()
        .filter((el) => el.type === "token" && !!el.characterId && mine.has(el.characterId))
        .map((el) => el.id);
      // A player with no tokens here sees the whole scene, rather than nothing.
      renderer.setLighting(lighting, !gm && lighting.vision && eyes.length ? eyes : null, gm);
    };
    push();
    const stop = watch([ctl.revision], push);
    ctl.scene.settings.observe(push);
    campaign.characters.observeDeep(push);
    campaign.members.observeDeep(push);
    return () => {
      stop();
      ctl.scene.settings.unobserve(push);
      campaign.characters.unobserveDeep(push);
      campaign.members.unobserveDeep(push);
    };
  }, [controller, campaign, renderer]);

  // Condition pips on linked tokens, and the ring on whoever's turn it is.
  useEffect(() => {
    if (!ready) return;
    const push = () => renderer.setTokenMarks(tokenMarksSource(campaign));
    push();
    campaign.characters.observeDeep(push);
    campaign.combat.observe(push);
    campaign.combatants.observe(push);
    return () => {
      campaign.characters.unobserveDeep(push);
      campaign.combat.unobserve(push);
      campaign.combatants.unobserve(push);
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
    SceneDoc.open(subdoc, { type: campaign.defaults().gridType, ...systemOf(campaign).scene }).then(
      (s) => {
        scene = s;
        if (cancelled) return s.destroy();
        ctl = new SceneController(
          s,
          renderer,
          hostRef.current!,
          sceneId,
          () => campaign.defaults(),
          campaign.presence,
        );
        ctl.start();
        setController(ctl);
        tokenDrop.value = (x, y, spec) => {
          // A template's token is a new copy of it, with a name of its own.
          if (spec.characterId) {
            const c = getCharacter(campaign, spec.characterId);
            if (c?.template) {
              const name = tokenName(c, c.template, ctl!.tokenNames());
              spec = { ...spec, name, characterId: createCopy(campaign, c.id, name) };
            }
            ctl!.addCharacterToken(
              ctl!.toWorld(x, y),
              spec as Required<Pick<typeof spec, "characterId" | "name">> & typeof spec,
            );
          } else {
            ctl!.addToken(ctl!.toWorld(x, y), spec.name, spec);
          }
          return true;
        };
        sceneCharacterAt.value = (x, y) => {
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
        };
        ctl.onItemTokenDragMove = (token, event) => {
          if (!token) {
            document.documentElement.classList.remove("is-reordering");
            setDropCursor(null);
            sceneDropHighlight.value = null;
            return;
          }
          const dragged = itemTokenEntity(campaign, token);
          const target = dragged ? dropTargetAt(event.clientX, event.clientY, dragged) : null;
          document.documentElement.classList.add("is-reordering");
          setDropCursor(!!target);
          sceneDropHighlight.value = target?.tokenId ?? null;
        };
        ctl.onItemTokenDrop = (token, event) => {
          const dragged = itemTokenEntity(campaign, token);
          const target = dragged ? dropTargetAt(event.clientX, event.clientY, dragged) : null;
          document.documentElement.classList.remove("is-reordering");
          setDropCursor(null);
          sceneDropHighlight.value = null;
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
            dropOn(target, dragged!, event.clientX, event.clientY);
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
            patches.push([id, { name, characterId: createCopy(campaign, template.id, name) }]);
          }
          if (patches.length) s.update(patches);
        };
        // Handy for poking at the scene from the console while developing.
        if (import.meta.env.DEV) Object.assign(window, { mamScene: ctl });
      },
    );
    return () => {
      cancelled = true;
      ctl?.stop();
      setController(null);
      tokenDrop.value = null;
      sceneCharacterAt.value = null;
      sceneDropHighlight.value = null;
      if (ctl) {
        ctl.onItemTokenDragMove = null;
        ctl.onItemTokenDrop = null;
      }
      renderer.setElements([]);
      scene?.destroy();
    };
  }, [ready, sceneId, campaign, renderer]);

  useEffect(() => {
    if (!controller) {
      activeMapColour.value = null;
      canvasCommands.value = null;
      return;
    }
    return watch([controller.mapColour], () => {
      const colour = controller.mapColour.value;
      activeMapColour.value = colour;
      seenMapColours.value = { ...seenMapColours.value, [controller.sceneId]: colour };
      canvasCommands.value = {
        sceneId: controller.sceneId,
        scene: controller.scene,
        fit: () => controller.fit(),
        undo: () => controller.scene.undo.undo(),
        redo: () => controller.scene.undo.redo(),
      };
    });
  }, [controller]);
  useEffect(() => () => void (canvasCommands.value = null), []);

  // Targeting for an action: hand the request to the scene, and its choices back.
  useEffect(
    () =>
      watch([targetPick], () => {
        controller?.setTargetMode(targetPick.value);
        if (!targetPick.value) placedArea.value = null;
      }),
    [controller],
  );
  useEffect(() => {
    if (!controller) {
      chosenTargets.value = [];
      return;
    }
    return watch([controller.targets, controller.revision], () => {
      const grid = controller.renderer.grid;
      chosenTargets.value = controller.targetDetails();
      sceneDistance.value = (d) => formatDistance(grid, d);
    });
  }, [controller]);

  // An action's area: place it, then target the tokens it covers (not the actor's, for areas that start from them).
  useEffect(() => {
    if (!controller) return;
    return watch([areaRequest], () => {
      const req = areaRequest.value;
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
          if (areaRequest.value === req) areaRequest.value = null;
          if (!placed) return;
          // A new area replaces the last one placed for this action.
          const before = placedArea.value;
          if (before) controller.scene.remove([before]);
          placedArea.value = placed.id;
          const actorTokens = new Set(
            controller
              .allElements()
              .filter((el) => el.type === "token" && req.actor && el.characterId === req.actor)
              .map((el) => el.id),
          );
          const covered = placed.covered.filter((id) => !(fromActor && actorTokens.has(id)));
          controller.setTargets(
            targetPick.value?.max ? covered.slice(0, targetPick.value!.max) : covered,
          );
        },
      });
    });
  }, [controller]);

  // Text: typed in a box where it goes on the map.
  const [textEdit, setTextEdit] = useState<{
    at: Point;
    screen: Point;
    id?: string;
    text?: string;
  } | null>(null);
  const onTextRequest = useEffectEvent((req: NonNullable<typeof textEdit>) => {
    setTextEdit(req);
  });
  useEffect(() => {
    const ctl = controller;
    if (!ctl) return;
    ctl.onTextRequest = onTextRequest;
    return () => void (ctl.onTextRequest = null);
  }, [controller]);
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
    ctl.importFiles(files, ctl.centre());
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
    if (hit && !ctl.selection.value.includes(hit.id)) ctl.selection.value = [hit.id];
    if (!hit) ctl.selection.value = [];
    setMenu({ x, y, items: hit ? selectionMenu(ctl) : canvasMenu(ctl, at) });
  }
  // Opens on the right-button press on every platform (see ui/menuTrigger.ts).
  const menuOpener = menuTrigger(openMenuAt);

  function selectionMenu(ctl: SceneController): MenuItem[] {
    const sel = ctl.selected();
    const ids = sel.map((el) => el.id);
    const one = sel.length === 1 ? sel[0] : null;
    const allLocked = sel.every((el) => el.locked);
    const items: MenuItem[] = [];
    if (one?.type === "token") {
      items.push({
        label: "Token options…",
        Icon: IconRename,
        onSelect: () => {
          setTokenTab("token");
          setTokenOptions(one.id);
        },
      });
    }
    const tokens = sel.filter((el) => el.type === "token");
    if (tokens.length && sceneId && hasCombat(campaign) && campaign.isGm()) {
      const out = tokens.filter((t) => !combatantForToken(campaign, t.id));
      items.push({
        label: "Add to combat",
        Icon: IconCombat,
        disabled: !out.length,
        onSelect: () => {
          addTokens(
            campaign,
            sceneId,
            out.map((t) => ({
              id: t.id,
              name: t.name,
              ...(t.type === "token" && t.characterId ? { characterId: t.characterId } : {}),
            })),
          );
          showPanel("combat");
        },
      });
    }
    if (one?.type === "wall") {
      items.push(
        one.door
          ? {
              label: one.open ? "Close door" : "Open door",
              Icon: IconWall,
              onSelect: () => ctl.setDoor(one.id, { open: !one.open }),
            }
          : {
              label: "Make it a door",
              Icon: IconWall,
              onSelect: () => ctl.setDoor(one.id, { door: true, open: false }),
            },
      );
      if (one.door)
        items.push({
          label: "Make it a wall",
          Icon: IconWall,
          onSelect: () => ctl.setDoor(one.id, { door: false }),
        });
    }
    if (one?.type === "light") {
      items.push(
        {
          label: "Light colour",
          colour: one.colour,
          onPreview: (colour) => ctl.previewLightColour(one.id, colour),
          onPick: (colour) => ctl.setLight(one.id, { colour }),
        },
        {
          label: "Flicker",
          Icon: IconLight,
          checked: !!one.flicker,
          onSelect: () => ctl.setLight(one.id, { flicker: !one.flicker }),
        },
      );
    }
    if (one?.type === "area") {
      const tone = one.tone === "light" ? "dark" : "light";
      items.push({
        label: tone === "dark" ? "Make it dark" : "Make it light",
        Icon: IconLight,
        onSelect: () => ctl.setAreaTone(one.id, tone),
      });
    }
    if (one?.type === "map")
      items.push({
        label: "Use as token",
        Icon: IconToken,
        onSelect: () => ctl.convert(one.id, "token"),
      });
    if (one?.type === "token" && one.image) {
      items.push({
        label: "Use as map",
        Icon: IconMap,
        onSelect: () => ctl.convert(one.id, "map"),
      });
    }
    if (sel.every((el) => el.type === "drawing")) {
      const under = sel.every((el) => el.layer === "under");
      items.push({
        label: under ? "Move above tokens" : "Move below tokens",
        Icon: IconLayers,
        onSelect: () => ctl.setLayer(ids, under ? "over" : "under"),
      });
    }
    if (items.length) items.push("divider");
    items.push(
      { label: "Bring to front", Icon: IconToFront, onSelect: () => ctl.restack(ids, "front") },
      { label: "Send to back", Icon: IconToBack, onSelect: () => ctl.restack(ids, "back") },
      {
        label: "Duplicate",
        Icon: IconDuplicate,
        shortcut: `${MOD}D`,
        onSelect: () => ctl.duplicate(ids),
      },
      allLocked
        ? { label: "Unlock", Icon: IconUnlock, onSelect: () => ctl.setLocked(ids, false) }
        : { label: "Lock", Icon: IconLock, onSelect: () => ctl.setLocked(ids, true) },
      "divider",
      {
        label: "Delete",
        Icon: IconDelete,
        shortcut: "Del",
        danger: true,
        disabled: allLocked,
        onSelect: () => ctl.remove(ids),
      },
    );
    return items;
  }

  function canvasMenu(ctl: SceneController, at: Point): MenuItem[] {
    return [
      {
        label: "Add token here",
        Icon: IconAdd,
        onSelect: () => ctl.addToken(at),
      },
      {
        label: "Add image here…",
        Icon: IconImage,
        onSelect: () => {
          importAt.current = at;
          fileRef.current?.click();
        },
      },
      "divider",
      {
        label: "Undo",
        Icon: IconUndo,
        shortcut: `${MOD}Z`,
        disabled: !ctl.canUndo.value,
        onSelect: () => ctl.scene.undo.undo(),
      },
      {
        label: "Redo",
        Icon: IconRedo,
        shortcut: `⇧${MOD}Z`,
        disabled: !ctl.canRedo.value,
        onSelect: () => ctl.scene.undo.redo(),
      },
      {
        label: "Fit to scene",
        Icon: IconFit,
        shortcut: "⇧1",
        onSelect: () => ctl.fit(),
      },
      {
        label: "Scene settings…",
        Icon: IconGrid,
        onSelect: () => (sceneSettingsOpen.value = true),
      },
    ];
  }

  /** Double-clicking a token opens its options. */
  function onDoubleClick(e: ReactMouseEvent<HTMLDivElement>) {
    const ctl = controller;
    if (!ctl || activeTool.value !== "select") return;
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
    ctl.importFiles(e.dataTransfer.files, ctl.toWorld(e.clientX, e.clientY));
  }

  return (
    <>
      <div
        ref={hostRef}
        className="scene-canvas"
        data-drop={dropping}
        onPointerDown={menuOpener.onPointerDown}
        onContextMenu={menuOpener.onContextMenu}
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
          if (ctl && files?.length) ctl.importFiles([...files], importAt.current ?? ctl.centre());
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

/** Name, style and colour of a token, applied together as one undo step. */
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
  const ref = useRef<HTMLDialogElement>(null);
  const el = id ? controller.element(id) : null;
  const token = el?.type === "token" ? el : null;
  const system = systemOf(campaign);
  const item = token ? itemDefinitionForToken(campaign, token) : undefined;
  const itemToken = !!item;
  const [name, setName] = useState("");
  const [style, setStyle] = useState<TokenStyle>("disc");
  const [colour, setColour] = useState("#000000");
  const [characterId, setCharacterId] = useState("");
  const [image, setImage] = useState<BlobRef | undefined>(undefined);
  const [size, setSize] = useState("");
  const [showName, setShowName] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const grid = controller.renderer.grid;
  const characters = useY(campaign.characters, () => listCharacters(campaign));
  // The character this token stands for, as saved (not the unsaved choice below).
  const linked = useY(campaign.characters, () => getCharacter(campaign, token?.characterId));

  const initializeTokenOptions = useEffectEvent(() => {
    if (!token) return;
    setName(token.name);
    setStyle(isPlainToken(token) ? "plain" : "disc");
    setColour(token.colour);
    // A template's token shows the template it's a copy of.
    const c = getCharacter(campaign, token.characterId);
    setCharacterId(c?.base ?? token.characterId ?? "");
    setImage(token.image);
    setShowName(!token.hideName);
    // The first size as wide as the token, or none if it's been resized by hand.
    const cells = Math.max(token.w, token.h) / grid.size;
    setSize(system.sizes.find((z) => Math.abs(z.cells - cells) < 0.01)?.id ?? "");
  });

  useEffect(() => {
    if (!id) return;
    initializeTokenOptions();
    openPopup(ref.current);
  }, [id]);

  // The table stays usable while this is open, so the token may be deleted.
  const exists = useY(
    controller.scene.elements,
    () => !!id && controller.scene.get(id)?.type === "token",
  );
  /**
   * The character a token links to when `chosen` is picked: a template makes
   * it a new copy, unless it's already a copy of that template.
   */
  const linkTo = (chosen: string): { characterId?: string; name?: string } => {
    if (!chosen) return {};
    if (linked?.base === chosen) return { characterId: linked.id };
    const c = characters.find((k) => k.id === chosen);
    if (!c?.template) return { characterId: chosen };
    const copyName = name.trim() || tokenName(c, c.template, controller.tokenNames());
    return {
      characterId: createCopy(campaign, chosen, copyName),
      name: copyName,
    };
  };
  useEffect(() => {
    if (id && !exists) ref.current?.close();
  }, [id, exists]);

  return (
    <Dialog
      dialogRef={ref}
      title={linked ? linked.name : (item?.name ?? token?.name ?? "Token options")}
      onClose={onClose}
      {...(linked ? { proxy: linkProxy(campaign, "character", linked.id, linked.name) } : {})}
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
      <form
        hidden={!!linked && tab === "character"}
        method="dialog"
        className="dialog-form"
        onSubmit={() => {
          if (id)
            controller.updateToken(
              id,
              {
                name: name.trim(),
                style: style === "plain" && !image ? "disc" : style,
                colour: colour,
                ...(image ? { image: image } : {}),
                ...(item ? { itemDefId: item.id } : {}),
                ...(!itemToken ? linkTo(characterId) : {}),
                ...(!showName ? { hideName: true } : {}),
              },
              system.sizes.find((z) => z.id === size)?.cells,
            );
        }}
      >
        <label className="field">
          Name
          <input
            className="input"
            value={name}
            onInput={(e) => setName(e.currentTarget.value)}
            autoFocus
            autoComplete="off"
          />
        </label>
        {!itemToken && (
          <label className="field">
            Character
            <select
              className="input"
              value={characterId}
              onChange={(e) => {
                setCharacterId(e.currentTarget.value);
                // Linking an unnamed token names it after the character.
                const c = characters.find((k) => k.id === characterId);
                if (c && !name.trim()) setName(c.name);
              }}
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
            <span className="token-image-preview">
              <BlobImage image={image} fallback={<span className="muted">None</span>} />
            </span>
            <Button size="sm" onClick={() => fileRef.current?.click()}>
              {image ? "Change…" : "Choose…"}
            </Button>
            {image && (
              <Button size="sm" variant="ghost" onClick={() => setImage(undefined)}>
                Remove
              </Button>
            )}
          </span>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              if (file) setImage(await importImage(file).catch(() => image));
            }}
          />
        </div>
        <label className="field">
          Size
          <select className="input" value={size} onChange={(e) => setSize(e.currentTarget.value)}>
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
              checked={showName}
              onChange={(e) => setShowName(e.currentTarget.checked)}
            />
            Name under the token
          </label>
        </div>
        <div className="field">
          Style
          <Segmented
            label="Token style"
            value={style}
            options={TOKEN_STYLES.map((s) => ({
              ...s,
              disabled: s.id === "plain" && !image,
              title: s.id === "plain" && !image ? "Needs an image" : undefined,
            }))}
            onChange={(v) => setStyle(v)}
          />
        </div>
        <label className="field colour-field" data-disabled={style === "plain"}>
          Background and border
          <span className="colour-row">
            <input
              type="color"
              className="colour-input"
              value={colour}
              disabled={style === "plain"}
              onInput={(e) => setColour(e.currentTarget.value)}
            />
            <span className="colour-hex">{colour}</span>
          </span>
        </label>
        <div className="form-actions">
          <Button variant="primary" type="submit">
            Save
          </Button>
        </div>
      </form>
    </Dialog>
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
  const ref = useRef<HTMLDialogElement>(null);
  const view = useY(campaign.scenes, () => campaign.sceneViews().find((s) => s.id === sceneId));
  const isOpen = useValue(sceneSettingsOpen);

  useEffect(() => {
    if (isOpen) openPopup(ref.current);
  }, [isOpen]);

  return (
    <Dialog
      dialogRef={ref}
      title={view ? `${view.name} settings` : "Scene settings"}
      onClose={() => (sceneSettingsOpen.value = false)}
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
