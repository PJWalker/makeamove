import { menuTrigger } from '../ui/menuTrigger'
import { addTokens, combatantForToken, hasCombat, tokenMarksSource } from '../combat/api'
import { bounds } from '../scene/geometry'
import { toScreen } from '../scene/camera'
import { setMorphOrigin } from '../ui/morph'
import { closePopup, openPopup } from "../ui/popup";
import { effect, type Signal, untracked, useSignal, useSignalEffect } from '@preact/signals'
import { device } from '../store/device'
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { SceneController } from "../scene/controller";
import { SceneRenderer } from '../scene/renderer'
import { activeTool } from '../scene/tools'
import { SceneDoc } from '../scene/sceneDoc'
import type { Point } from "../scene/grid";
import {
  isPlainToken,
  TOKEN_STYLES,
  type SceneElement,
  type TokenStyle,
} from "../scene/types";
import type { EntityGraphic } from "../graphics";
import type { Campaign } from "../store/campaign";
import { canEdit, createCopy, getCharacter, listCharacters, selectCharacter, systemOf, tokenStatsSource } from '../characters/api'
import { tokenName } from '../characters/templates'
import { CharacterSheet } from './sheets'
import { useY } from '../store/useY'
import { GraphicPicker } from "../ui/GraphicPicker";
import { Button } from '../ui/Button'
import {
  IconAdd,
  IconDelete,
  IconDuplicate,
  IconFit,
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
import { isTyping, MOD } from '../ui/keys'
import { PopupTabs } from '../ui/PopupTabs'
import { Segmented } from '../ui/Segmented'
import { Dialog } from './CampaignDialogs'
import { showPanel } from './panelLayout'
import { dropOn, dropTargetAt, itemDefinitionForToken, itemTokenEntity, setDropCursor } from './entityDrag'
import {
  activeMapColour,
  canvasCommands,
  chosenTargets,
  areaRequest,
  placedArea,
  sceneDistance,
  seenMapColours,
  targetPick,
  tokenDrop,
  sceneCharacterAt,
  sceneDropFlash,
  sceneDropHighlight,
} from "./canvasState";
import { formatDistance } from '../scene/measure'
import { linkProxy } from './LinkChip'
import {
  getDefaultEntityGraphic,
  getEntityGraphic,
  setEntityGraphic,
} from "./entityGraphics";
import { ContextMenu, type MenuItem } from './ContextMenu'

/**
 * The scene canvas: hosts the PixiJS renderer and wires it to the active
 * scene. Loaded lazily, so PixiJS stays out of the lobby's bundle.
 */
export default function SceneCanvas({ campaign, sceneId }: { campaign: Campaign; sceneId: string | null }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const importAt = useRef<Point | null>(null)
  const [renderer] = useState(() => new SceneRenderer())
  const ready = useSignal(false)
  const controller = useSignal<SceneController | null>(null)
  const graphicMap = useY(campaign.entityGraphics, () =>
    JSON.stringify([...campaign.entityGraphics.entries()]),
  );
  const menu = useSignal<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const tokenOptions = useSignal<string | null>(null)
  /** Which tab the token pop-up opens on. */
  const tokenTab = useSignal<'character' | 'token'>('token')
  const dropping = useSignal(false)
  const lastDropFlash = useRef(0)

  useSignalEffect(() => {
    if (!ready.value) return
    renderer.setDropHighlight(sceneDropHighlight.value)
    const flash = sceneDropFlash.value
    if (flash && flash.nonce !== lastDropFlash.current) {
      lastDropFlash.current = flash.nonce
      renderer.flashToken(flash.tokenId)
    }
  })

  // Selecting a character's token goes to that character's sheet.
  useEffect(() => {
    const ctl = controller.value
    if (!ctl) return
    let last = ''
    let first = true
    return ctl.selection.subscribe((sel) => {
      const el = sel.length === 1 ? ctl.element(sel[0]) : null
      const id = el?.type === 'token' ? el.characterId : undefined
      const fresh = id && sel[0] !== last && !first && campaign.characters.has(id)
      last = sel[0] ?? ''
      first = false
      if (!fresh) return
      selectCharacter(campaign, id)
      showPanel('characters')
    })
  }, [controller.value])

  useEffect(() => {
    renderer.init(hostRef.current!).then(() => (ready.value = true))
    return () => renderer.destroy()
  }, [])

  // Keep linked tokens' stats current as characters change.
  useEffect(() => {
    if (!ready.value) return
    const push = () => renderer.setTokenStats(tokenStatsSource(campaign))
    push()
    campaign.characters.observeDeep(push)
    return () => campaign.characters.unobserveDeep(push)
  }, [ready.value, campaign])

  // Light and sight: the scene's lighting, the GM's walls and lights, and for
  // a player in a scene with vision on, sight through their own characters' tokens.
  useEffect(() => {
    const ctl = controller.value
    if (!ctl) return
    const push = () => {
      const gm = campaign.isGm()
      ctl.gm = gm
      const lighting = ctl.scene.lighting()
      const mine = new Set(listCharacters(campaign).filter((c) => c.kind === 'pc' && c.owner === device.value.id).map((c) => c.id))
      const eyes = ctl
        .allElements()
        .filter((el) => el.type === 'token' && !!el.characterId && mine.has(el.characterId))
        .map((el) => el.id)
      // A player with no tokens here sees the whole scene, rather than nothing.
      renderer.setLighting(lighting, !gm && lighting.vision && eyes.length ? eyes : null, gm)
    }
    push()
    const stop = effect(() => {
      void ctl.revision.value
      untracked(push)
    })
    ctl.scene.settings.observe(push)
    campaign.characters.observeDeep(push)
    campaign.members.observeDeep(push)
    return () => {
      stop()
      ctl.scene.settings.unobserve(push)
      campaign.characters.unobserveDeep(push)
      campaign.members.unobserveDeep(push)
    }
  }, [controller.value, campaign])

  // Condition pips on linked tokens, and the ring on whoever's turn it is.
  useEffect(() => {
    if (!ready.value) return
    const push = () => renderer.setTokenMarks(tokenMarksSource(campaign))
    push()
    campaign.characters.observeDeep(push)
    campaign.combat.observe(push)
    campaign.combatants.observe(push)
    return () => {
      campaign.characters.unobserveDeep(push)
      campaign.combat.unobserve(push)
      campaign.combatants.unobserve(push)
    }
  }, [ready.value, campaign])

  // Open the scene's subdocument and drive it, swapping on scene change.
  useEffect(() => {
    if (!ready.value || !sceneId) return
    const subdoc = campaign.sceneSubdoc(sceneId)
    if (!subdoc) return
    let cancelled = false
    let scene: SceneDoc | null = null
    let ctl: SceneController | null = null
    SceneDoc.open(subdoc, { type: campaign.defaults().gridType, ...systemOf(campaign).scene }).then((s) => {
      scene = s
      if (cancelled) return s.destroy()
      ctl = new SceneController(s, renderer, hostRef.current!, sceneId, () => campaign.defaults(), campaign.presence)
      ctl.start()
      controller.value = ctl
      tokenDrop.value = (x, y, spec) => {
        // A template's token is a new copy of it, with a name of its own.
        if (spec.characterId) {
          const c = getCharacter(campaign, spec.characterId)
          if (c?.template) {
            const name = tokenName(c, c.template, ctl!.tokenNames())
            spec = { ...spec, name, characterId: createCopy(campaign, c.id, name) }
          }
          ctl!.addCharacterToken(ctl!.toWorld(x, y), spec as Required<Pick<typeof spec, 'characterId' | 'name'>> & typeof spec)
        } else {
          ctl!.addToken(ctl!.toWorld(x, y), spec.name, spec)
        }
        return true
      }
      sceneCharacterAt.value = (x, y) => {
        const hit = ctl!.hitTest(ctl!.toWorld(x, y), true, true)
        if (hit?.type !== 'token' || !hit.characterId) return null
        const character = getCharacter(campaign, hit.characterId)
        const bounds = hostRef.current!.getBoundingClientRect()
        const screen = toScreen(renderer.camera, hit)
        return {
          characterId: hit.characterId,
          tokenId: hit.id,
          editable: !!character && canEdit(campaign, character),
          center: { x: bounds.left + screen.x, y: bounds.top + screen.y },
        }
      }
      ctl.onItemTokenDragMove = (token, event) => {
        if (!token) {
          document.documentElement.classList.remove('is-reordering')
          setDropCursor(null)
          sceneDropHighlight.value = null
          return
        }
        const dragged = itemTokenEntity(campaign, token)
        const target = dragged ? dropTargetAt(event.clientX, event.clientY, dragged) : null
        document.documentElement.classList.add('is-reordering')
        setDropCursor(!!target)
        sceneDropHighlight.value = target?.tokenId ?? null
      }
      ctl.onItemTokenDrop = (token, event) => {
        const dragged = itemTokenEntity(campaign, token)
        const target = dragged ? dropTargetAt(event.clientX, event.clientY, dragged) : null
        document.documentElement.classList.remove('is-reordering')
        setDropCursor(null)
        sceneDropHighlight.value = null
        if (!target) {
          const overCanvas = hostRef.current?.contains(document.elementFromPoint(event.clientX, event.clientY)) ?? false
          if (!overCanvas) {
            ctl!.renderer.previews.delete(token.id)
            ctl!.renderer.invalidate('previews', 'overlay')
            return true
          }
          return false
        }
        if (target.element.matches('.scene-canvas') && !target.tokenId) return false
        const destination = target.tokenCenter ?? { x: event.clientX, y: event.clientY }
        ctl!.animateItemTokenDrop(token.id, destination.x, destination.y, () => {
          dropOn(target, dragged!, event.clientX, event.clientY)
          ctl!.scene.remove([token.id])
          ctl!.selection.value = ctl!.selection.value.filter((id) => id !== token.id)
        })
        return true
      }
      // A duplicated copy's token gets a copy of its own, from the same template.
      ctl.afterDuplicate = (ids) => {
        const patches: [string, Partial<SceneElement>][] = []
        for (const id of ids) {
          const el = s.get(id)
          const copy = el?.type === 'token' ? getCharacter(campaign, el.characterId) : undefined
          const template = copy?.base ? getCharacter(campaign, copy.base) : undefined
          if (!template?.template) continue
          const name = tokenName(template, template.template, ctl!.tokenNames())
          patches.push([id, { name, characterId: createCopy(campaign, template.id, name) }])
        }
        if (patches.length) s.update(patches)
      }
      // Handy for poking at the scene from the console while developing.
      if (import.meta.env.DEV) Object.assign(window, { mamScene: ctl })
    })
    return () => {
      cancelled = true
      ctl?.stop()
      controller.value = null
      tokenDrop.value = null
      sceneCharacterAt.value = null
      sceneDropHighlight.value = null
      if (ctl) {
        ctl.onItemTokenDragMove = null
        ctl.onItemTokenDrop = null
      }
      renderer.setElements([])
      scene?.destroy()
    }
  }, [ready.value, sceneId])

  useSignalEffect(() => {
    const ctl = controller.value
    const colour = ctl?.mapColour.value ?? null
    activeMapColour.value = colour
    if (ctl) seenMapColours.value = { ...seenMapColours.peek(), [ctl.sceneId]: colour }
    canvasCommands.value = ctl
      ? {
          fit: () => ctl.fit(),
          undo: () => ctl.scene.undo.undo(),
          redo: () => ctl.scene.undo.redo(),
          sceneId: ctl.sceneId,
          scene: ctl.scene,
        }
      : null;
  })
  useEffect(() => () => void (canvasCommands.value = null), [])

  // Targeting for an action: hand the request to the scene, and its choices back.
  useSignalEffect(() => {
    const ctl = controller.value
    const pick = targetPick.value
    untracked(() => ctl?.setTargetMode(pick))
  })
  useSignalEffect(() => {
    const ctl = controller.value
    if (!ctl) return void (chosenTargets.value = [])
    void ctl.targets.value
    void ctl.revision.value
    const grid = ctl.renderer.grid
    chosenTargets.value = untracked(() => ctl.targetDetails())
    sceneDistance.value = (d) => formatDistance(grid, d)
  })

  // An action's area: place it, then target the tokens it covers (not the actor's, for areas that start from them).
  useSignalEffect(() => {
    const ctl = controller.value
    const req = areaRequest.value
    if (!ctl) return
    untracked(() => {
      if (!req) return ctl.placeArea(null)
      const grid = ctl.renderer.grid
      const px = (units: number) => (units / (grid.unit || 1)) * grid.size
      const { area } = req
      const shape = area.shape === 'cube' ? 'rect' : area.shape === 'cone' ? 'cone' : area.shape === 'line' ? 'line' : 'circle'
      const fromActor = area.shape === 'cone' || area.shape === 'line' || area.shape === 'emanation'
      ctl.placeArea({
        shape,
        length: px(area.size),
        width: px(area.width ?? grid.unit),
        onPlaced: (placed) => {
          if (areaRequest.peek() === req) areaRequest.value = null
          if (!placed) return
          // A new area replaces the last one placed for this action.
          const before = placedArea.peek()
          if (before) ctl.scene.remove([before])
          placedArea.value = placed.id
          const actorTokens = new Set(
            ctl.allElements().filter((el) => el.type === 'token' && req.actor && el.characterId === req.actor).map((el) => el.id),
          )
          const covered = placed.covered.filter((id) => !(fromActor && actorTokens.has(id)))
          ctl.setTargets(targetPick.peek()?.max ? covered.slice(0, targetPick.peek()!.max) : covered)
        },
      })
    })
  })
  // Asking for targets again starts without an area.
  useSignalEffect(() => {
    if (!targetPick.value) placedArea.value = null
  })

  // Text: typed in a box where it goes on the map.
  const textEdit = useSignal<{ at: Point; screen: Point; id?: string; text?: string } | null>(null)
  useEffect(() => {
    const ctl = controller.value
    if (!ctl) return
    ctl.onTextRequest = (req) => (textEdit.value = req)
    return () => void (ctl.onTextRequest = null)
  }, [controller.value])
  const commitText = (value: string) => {
    const req = textEdit.value
    textEdit.value = null
    if (req) controller.value?.putText(req.at, value, req.id)
  }

  // Keyboard shortcuts, unless a field or dialog has the keyboard.
  useEffect(() => {
    // Pop-ups are non-modal: only keys aimed inside one stay with it.
    const blocked = (e: KeyboardEvent) => isTyping(e.target) || !!(e.target as Element).closest?.('dialog')
    const onDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || blocked(e)) return
      // Space only pans when nothing focusable would otherwise take it.
      if (e.key === ' ' && document.activeElement instanceof HTMLButtonElement) return
      if (controller.value?.onKeyDown(e)) e.preventDefault()
    }
    const onUp = (e: KeyboardEvent) => controller.value?.onKeyUp(e)
    const onBlur = () => controller.value?.onBlur()
    const onPaste = (e: ClipboardEvent) => {
      const ctl = controller.value
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'))
      if (!ctl || !files.length || isTyping(e.target)) return
      e.preventDefault()
      ctl.importFiles(files, ctl.centre())
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)
    document.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('paste', onPaste)
    }
  }, [])

  const closeMenu = useCallback(() => (menu.value = null), [])

  /** Open the right-click menu for whatever is at a client point. */
  function openMenuAt(x: number, y: number) {
    const ctl = controller.value
    if (!ctl) return
    ctl.cancelGesture()
    const at = ctl.toWorld(x, y)
    const hit = ctl.hitTest(at, true)
    if (hit && !ctl.selection.value.includes(hit.id)) ctl.selection.value = [hit.id]
    if (!hit) ctl.selection.value = []
    menu.value = { x, y, items: hit ? selectionMenu(ctl) : canvasMenu(ctl, at) }
  }
  // Opens on the right-button press on every platform (see ui/menuTrigger.ts).
  const menuOpener = menuTrigger(openMenuAt)

  useEffect(() => {
    const ctl = controller.value;
    if (!ctl) return;
    for (const token of ctl.allElements()) {
      if (token.type !== "token" || !token.entityRef) continue;
      const graphic = getEntityGraphic(
        campaign,
        token.entityRef.kind,
        token.entityRef.id,
      );
      if (JSON.stringify(graphic) !== JSON.stringify(token.graphic))
        ctl.updateToken(token.id, { graphic });
    }
  }, [graphicMap, controller.value]);

  function selectionMenu(ctl: SceneController): MenuItem[] {
    const sel = ctl.selected()
    const ids = sel.map((el) => el.id)
    const one = sel.length === 1 ? sel[0] : null
    const allLocked = sel.every((el) => el.locked)
    const items: MenuItem[] = []
    if (one?.type === 'token') {
      items.push({ label: 'Token options…', Icon: IconRename, onSelect: () => {
        tokenTab.value = 'token'
        tokenOptions.value = one.id
      } })
    }
    const tokens = sel.filter((el) => el.type === 'token')
    if (tokens.length && sceneId && hasCombat(campaign) && campaign.isGm()) {
      const out = tokens.filter((t) => !combatantForToken(campaign, t.id))
      items.push({
        label: 'Add to combat',
        Icon: IconCombat,
        disabled: !out.length,
        onSelect: () => {
          addTokens(campaign, sceneId, out.map((t) => ({ id: t.id, name: t.name, ...(t.type === 'token' && t.characterId ? { characterId: t.characterId } : {}) })))
          showPanel('combat')
        },
      })
    }
    if (one?.type === 'wall') {
      items.push(
        one.door
          ? { label: one.open ? 'Close door' : 'Open door', Icon: IconWall, onSelect: () => ctl.setDoor(one.id, { open: !one.open }) }
          : { label: 'Make it a door', Icon: IconWall, onSelect: () => ctl.setDoor(one.id, { door: true, open: false }) },
      )
      if (one.door) items.push({ label: 'Make it a wall', Icon: IconWall, onSelect: () => ctl.setDoor(one.id, { door: false }) })
    }
    if (one?.type === 'light') {
      items.push(
        {
          label: 'Light colour',
          colour: one.colour,
          onPreview: (colour) => ctl.previewLightColour(one.id, colour),
          onPick: (colour) => ctl.setLight(one.id, { colour }),
        },
        { label: 'Flicker', Icon: IconLight, checked: !!one.flicker, onSelect: () => ctl.setLight(one.id, { flicker: !one.flicker }) },
      )
    }
    if (one?.type === 'area') {
      const tone = one.tone === 'light' ? 'dark' : 'light'
      items.push({ label: tone === 'dark' ? 'Make it dark' : 'Make it light', Icon: IconLight, onSelect: () => ctl.setAreaTone(one.id, tone) })
    }
    if (one?.type === 'map') items.push({ label: 'Use as token', Icon: IconToken, onSelect: () => ctl.convert(one.id, 'token') })
    if (one?.type === "token" && one.graphic?.kind === "image") {
      items.push({
        label: "Use as map",
        Icon: IconMap,
        onSelect: () => ctl.convert(one.id, "map"),
      });
    }
    if (sel.every((el) => el.type === 'drawing')) {
      const under = sel.every((el) => el.layer === 'under')
      items.push({
        label: under ? 'Move above tokens' : 'Move below tokens',
        Icon: IconLayers,
        onSelect: () => ctl.setLayer(ids, under ? 'over' : 'under'),
      })
    }
    if (items.length) items.push('divider')
    items.push(
      { label: 'Bring to front', Icon: IconToFront, onSelect: () => ctl.restack(ids, 'front') },
      { label: 'Send to back', Icon: IconToBack, onSelect: () => ctl.restack(ids, 'back') },
      { label: 'Duplicate', Icon: IconDuplicate, shortcut: `${MOD}D`, onSelect: () => ctl.duplicate(ids) },
      allLocked
        ? { label: 'Unlock', Icon: IconUnlock, onSelect: () => ctl.setLocked(ids, false) }
        : { label: 'Lock', Icon: IconLock, onSelect: () => ctl.setLocked(ids, true) },
      'divider',
      { label: 'Delete', Icon: IconDelete, shortcut: 'Del', danger: true, disabled: allLocked, onSelect: () => ctl.remove(ids) },
    )
    return items
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
        Icon: IconMap,
        onSelect: () => showPanel("scene"),
      },
    ];
  }

  /** Double-clicking a token opens its options. */
  function onDoubleClick(e: MouseEvent) {
    const ctl = controller.value
    if (!ctl || activeTool.value !== 'select') return
    const hit = ctl.hitTest(ctl.toWorld(e.clientX, e.clientY))
    if (hit?.type !== 'token') return
    // Grow the options out of the token itself.
    const b = bounds([hit])!
    const cam = ctl.renderer.camera
    const host = hostRef.current!.getBoundingClientRect()
    setMorphOrigin(
      new DOMRect(host.left + b.x * cam.zoom + cam.x, host.top + b.y * cam.zoom + cam.y, b.w * cam.zoom, b.h * cam.zoom),
    )
    // A token with a character opens on its sheet.
    tokenTab.value = hit.characterId ? 'character' : 'token'
    tokenOptions.value = hit.id
  }

  function onDragOver(e: DragEvent) {
    if (!e.dataTransfer?.types.includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    dropping.value = true
  }

  function onDrop(e: DragEvent) {
    dropping.value = false
    const ctl = controller.value
    if (!ctl || !e.dataTransfer?.files.length) return
    e.preventDefault()
    ctl.importFiles(e.dataTransfer.files, ctl.toWorld(e.clientX, e.clientY))
  }

  return (
    <>
      <div
        ref={hostRef}
        class="scene-canvas"
        data-drop={dropping.value}
        onPointerDown={menuOpener.onPointerDown}
        onContextMenu={menuOpener.onContextMenu}
        onDblClick={onDoubleClick}
        onDragOver={onDragOver}
        onDragLeave={() => (dropping.value = false)}
        onDrop={onDrop}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const ctl = controller.value;
          const files = e.currentTarget.files;
          if (ctl && files?.length)
            ctl.importFiles([...files], importAt.current ?? ctl.centre());
          e.currentTarget.value = "";
        }}
      />
      {menu.value && <ContextMenu {...menu.value} onClose={closeMenu} />}
      {textEdit.value && (
        <input
          key={`${textEdit.value.screen.x},${textEdit.value.screen.y}`}
          class="input bevel scene-text-input"
          style={{
            left: `${textEdit.value.screen.x}px`,
            top: `${textEdit.value.screen.y}px`,
          }}
          aria-label="Text"
          defaultValue={textEdit.value.text ?? ""}
          ref={(el) => void (el && requestAnimationFrame(() => el.focus()))}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitText(e.currentTarget.value);
            else if (e.key === "Escape") textEdit.value = null;
            e.stopPropagation();
          }}
          onBlur={(e) => textEdit.value && commitText(e.currentTarget.value)}
        />
      )}
      {controller.value && (
        <>
          <TokenOptionsDialog
            campaign={campaign}
            controller={controller.value}
            id={tokenOptions.value}
            tab={tokenTab}
            onClose={() => (tokenOptions.value = null)}
          />
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
  onClose,
}: {
  campaign: Campaign
  controller: SceneController
  id: string | null
  tab: Signal<'character' | 'token'>
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const el = id ? controller.element(id) : null
  const token = el?.type === 'token' ? el : null
  const system = systemOf(campaign)
  const item = token ? itemDefinitionForToken(campaign, token) : undefined
  const itemToken = !!item
  const entityRef =
    token?.entityRef ??
    (item
      ? { kind: "item", id: item.id }
      : token?.characterId
        ? { kind: "character", id: token.characterId }
        : undefined);
  const name = useSignal('')
  const style = useSignal<TokenStyle>('disc')
  const colour = useSignal('#000000')
  const characterId = useSignal('')
  const graphic = useSignal<EntityGraphic | undefined>(undefined);
  const resetGraphic = useSignal(false);
  const size = useSignal('')
  const showName = useSignal(true);
  const grid = controller.renderer.grid
  const characters = useY(campaign.characters, () => listCharacters(campaign))
  // The character this token stands for, as saved (not the unsaved choice below).
  const linked = useY(campaign.characters, () => getCharacter(campaign, token?.characterId))

  useEffect(() => {
    if (!token) return
    name.value = token.name
    style.value = isPlainToken(token) ? 'plain' : 'disc'
    colour.value = token.colour
    // A template's token shows the template it's a copy of.
    const c = getCharacter(campaign, token.characterId)
    characterId.value = c?.base ?? token.characterId ?? ''
    graphic.value = entityRef
      ? getEntityGraphic(campaign, entityRef.kind, entityRef.id)
      : token.graphic;
    resetGraphic.value = false;
    showName.value = !token.hideName
    // The first size as wide as the token, or none if it's been resized by hand.
    const cells = Math.max(token.w, token.h) / grid.size
    size.value = system.sizes.find((z) => Math.abs(z.cells - cells) < 0.01)?.id ?? ''
    openPopup(ref.current)
  }, [id])

  // The table stays usable while this is open, so the token may be deleted.
  const exists = useY(controller.scene.elements, () => !!id && controller.scene.get(id)?.type === 'token')
  /**
   * The character a token links to when `chosen` is picked: a template makes
   * it a new copy, unless it's already a copy of that template.
   */
  const linkTo = (chosen: string): { characterId?: string; name?: string } => {
    if (!chosen) return { characterId: undefined }
    if (linked?.base === chosen) return { characterId: linked.id }
    const c = characters.find((k) => k.id === chosen)
    if (!c?.template) return { characterId: chosen }
    const copyName = name.value.trim() || tokenName(c, c.template, controller.tokenNames())
    return { characterId: createCopy(campaign, chosen, copyName), name: copyName }
  }
  useEffect(() => {
    if (id && !exists) closePopup(ref.current, onClose);
  }, [id, exists])

  return (
    <Dialog
      dialogRef={ref}
      title={
        linked ? linked.name : (item?.name ?? token?.name ?? "Token options")
      }
      onClose={onClose}
      proxy={
        linked
          ? linkProxy(campaign, "character", linked.id, linked.name)
          : undefined
      }
    >
      {linked && (
        <PopupTabs
          tabs={[
            { id: "character", label: "Character" },
            { id: "token", label: "Token" },
          ]}
          value={tab.value}
          onChange={(t) => (tab.value = t)}
        />
      )}
      {linked && tab.value === "character" && (
        <div class="popup-sheet sheet-panel">
          <CharacterSheet campaign={campaign} system={system} c={linked} />
        </div>
      )}
      <form
        hidden={!!linked && tab.value === "character"}
        method="dialog"
        class="dialog-form"
        onSubmit={() => {
          if (!id) return;
          const chosenLink = !itemToken ? linkTo(characterId.value) : {};
          const nextEntityRef = item
            ? { kind: "item", id: item.id }
            : chosenLink.characterId
              ? { kind: "character", id: chosenLink.characterId }
              : undefined;
          if (nextEntityRef)
            setEntityGraphic(
              campaign,
              nextEntityRef.kind,
              nextEntityRef.id,
              resetGraphic.value ? undefined : graphic.value,
            );
          const shownGraphic = nextEntityRef
            ? getEntityGraphic(campaign, nextEntityRef.kind, nextEntityRef.id)
            : resetGraphic.value
              ? getDefaultEntityGraphic(campaign, "token", "")
              : graphic.value;
          controller.updateToken(
            id,
            {
              name: name.value.trim(),
              style:
                style.value === "plain" && shownGraphic?.kind !== "image"
                  ? "disc"
                  : style.value,
              colour: colour.value,
              graphic: shownGraphic,
              entityRef: nextEntityRef,
              ...(item ? { itemDefId: item.id } : {}),
              ...chosenLink,
              hideName: showName.value ? undefined : true,
            },
            system.sizes.find((z) => z.id === size.value)?.cells,
          );
        }}
      >
        <label class="field">
          Name
          <input
            class="input bevel"
            value={name.value}
            onInput={(e) => (name.value = e.currentTarget.value)}
            autoFocus
            autoComplete="off"
          />
        </label>
        {!itemToken && (
          <label class="field">
            Character
            <select
              class="input bevel"
              value={characterId.value}
              onChange={(e) => {
                characterId.value = e.currentTarget.value;
                // Linking an unnamed token names it after the character.
                const c = characters.find((k) => k.id === characterId.value);
                if (c && !name.value.trim()) name.value = c.name;
              }}
            >
              <option value="">None</option>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <span class="muted">
              The game system decides which of its stats show on the token.
            </span>
          </label>
        )}
        <GraphicPicker
          graphic={
            resetGraphic.value
              ? getDefaultEntityGraphic(
                  campaign,
                  entityRef?.kind ?? "token",
                  entityRef?.id ?? "",
                )
              : (graphic.value ??
                (token?.entityRef
                  ? getEntityGraphic(
                      campaign,
                      token.entityRef.kind,
                      token.entityRef.id,
                    )
                  : token?.graphic))
          }
          onChange={(next) => {
            graphic.value = next;
            resetGraphic.value = false;
          }}
          onReset={() => {
            graphic.value = undefined;
            resetGraphic.value = true;
          }}
        />
        <label class="field">
          Size
          <select
            class="input bevel"
            value={size.value}
            onChange={(e) => (size.value = e.currentTarget.value)}
          >
            {!size.value && <option value="">As drawn</option>}
            {system.sizes.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name} ({z.cells === 0.5 ? "½" : z.cells}{" "}
                {z.cells > 1 ? "cells" : "cell"})
              </option>
            ))}
          </select>
        </label>
        <div class="field">
          Show
          <label class="check">
            <input
              type="checkbox"
              checked={showName.value}
              onChange={(e) => (showName.value = e.currentTarget.checked)}
            />
            Name under the token
          </label>
        </div>
        <div class="field">
          Style
          <Segmented
            label="Token style"
            value={style.value}
            options={TOKEN_STYLES.map((s) => ({
              ...s,
              disabled: s.id === "plain" && graphic.value?.kind !== "image",
              title:
                s.id === "plain" && graphic.value?.kind !== "image"
                  ? "Needs an image"
                  : undefined,
            }))}
            onChange={(v) => (style.value = v)}
          />
        </div>
        <label
          class="field colour-field"
          data-disabled={style.value === "plain"}
        >
          Background and border
          <span class="colour-row">
            <input
              type="color"
              class="colour-input bevel"
              value={colour.value}
              disabled={style.value === "plain"}
              onInput={(e) => (colour.value = e.currentTarget.value)}
            />
            <span class="colour-hex">{colour.value}</span>
          </span>
        </label>
        <div class="form-actions">
          <Button variant="primary" type="submit">
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
