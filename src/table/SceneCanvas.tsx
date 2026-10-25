import { menuTrigger } from '../ui/menuTrigger'
import { bounds } from '../scene/geometry'
import { setMorphOrigin } from '../ui/morph'
import { openPopup } from '../ui/popup'
import { useSignal, useSignalEffect } from '@preact/signals'
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { SceneController } from '../scene/controller'
import { DEFAULT_GRID, GRID_TYPES, MIN_GRID_SIZE } from '../scene/grid'
import { SceneRenderer } from '../scene/renderer'
import { activeTool } from '../scene/tools'
import { SceneDoc } from '../scene/sceneDoc'
import type { Point } from '../scene/grid'
import { isPlainToken, TOKEN_STYLES, type TokenStyle } from '../scene/types'
import { DEFAULT_CANVAS_COLOUR, type Campaign } from '../store/campaign'
import { useY } from '../store/useY'
import { Button } from '../ui/Button'
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
  IconUndo,
  IconUnlock,
} from '../ui/icons'
import { isTyping, MOD } from '../ui/keys'
import { Segmented } from '../ui/Segmented'
import { Dialog } from './CampaignDialogs'
import { activeMapColour, canvasColour, canvasCommands, sceneSettingsOpen, seenMapColours } from './canvasState'
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
  const menu = useSignal<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const tokenOptions = useSignal<string | null>(null)
  const dropping = useSignal(false)

  useEffect(() => {
    renderer.init(hostRef.current!).then(() => (ready.value = true))
    return () => renderer.destroy()
  }, [])

  // Open the scene's subdocument and drive it, swapping on scene change.
  useEffect(() => {
    if (!ready.value || !sceneId) return
    const subdoc = campaign.sceneSubdoc(sceneId)
    if (!subdoc) return
    let cancelled = false
    let scene: SceneDoc | null = null
    let ctl: SceneController | null = null
    SceneDoc.open(subdoc, campaign.defaults().gridType).then((s) => {
      scene = s
      if (cancelled) return s.destroy()
      ctl = new SceneController(s, renderer, hostRef.current!, sceneId, () => campaign.defaults(), campaign.presence)
      ctl.start()
      controller.value = ctl
      // Handy for poking at the scene from the console while developing.
      if (import.meta.env.DEV) Object.assign(window, { mamScene: ctl })
    })
    return () => {
      cancelled = true
      ctl?.stop()
      controller.value = null
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
      ? { fit: () => ctl.fit(), undo: () => ctl.scene.undo.undo(), redo: () => ctl.scene.undo.redo() }
      : null
  })
  useEffect(() => () => void (canvasCommands.value = null), [])

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

  function selectionMenu(ctl: SceneController): MenuItem[] {
    const sel = ctl.selected()
    const ids = sel.map((el) => el.id)
    const one = sel.length === 1 ? sel[0] : null
    const allLocked = sel.every((el) => el.locked)
    const items: MenuItem[] = []
    if (one?.type === 'token') {
      items.push({ label: 'Token options…', Icon: IconRename, onSelect: () => (tokenOptions.value = one.id) })
    }
    if (one?.type === 'map') items.push({ label: 'Use as token', Icon: IconToken, onSelect: () => ctl.convert(one.id, 'token') })
    if (one?.type === 'token' && one.image) {
      items.push({ label: 'Use as map', Icon: IconMap, onSelect: () => ctl.convert(one.id, 'map') })
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
      { label: 'Add token here', Icon: IconAdd, onSelect: () => ctl.addToken(at) },
      {
        label: 'Add image here…',
        Icon: IconImage,
        onSelect: () => {
          importAt.current = at
          fileRef.current?.click()
        },
      },
      'divider',
      { label: 'Undo', Icon: IconUndo, shortcut: `${MOD}Z`, disabled: !ctl.canUndo.value, onSelect: () => ctl.scene.undo.undo() },
      { label: 'Redo', Icon: IconRedo, shortcut: `⇧${MOD}Z`, disabled: !ctl.canRedo.value, onSelect: () => ctl.scene.undo.redo() },
      { label: 'Fit to scene', Icon: IconFit, shortcut: '⇧1', onSelect: () => ctl.fit() },
      { label: 'Scene settings…', Icon: IconGrid, onSelect: () => (sceneSettingsOpen.value = true) },
    ]
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
          const ctl = controller.value
          const files = e.currentTarget.files
          if (ctl && files?.length) ctl.importFiles([...files], importAt.current ?? ctl.centre())
          e.currentTarget.value = ''
        }}
      />
      {menu.value && <ContextMenu {...menu.value} onClose={closeMenu} />}
      {controller.value && (
        <>
          <TokenOptionsDialog controller={controller.value} id={tokenOptions.value} onClose={() => (tokenOptions.value = null)} />
          <SceneSettingsDialog campaign={campaign} sceneId={sceneId!} scene={controller.value.scene} />
        </>
      )}
    </>
  )
}

/** Name, style and colour of a token, applied together as one undo step. */
function TokenOptionsDialog({
  controller,
  id,
  onClose,
}: {
  controller: SceneController
  id: string | null
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const el = id ? controller.element(id) : null
  const token = el?.type === 'token' ? el : null
  const name = useSignal('')
  const style = useSignal<TokenStyle>('disc')
  const colour = useSignal('#000000')

  useEffect(() => {
    if (!token) return
    name.value = token.name
    style.value = isPlainToken(token) ? 'plain' : 'disc'
    colour.value = token.colour
    openPopup(ref.current)
  }, [id])

  // The table stays usable while this is open, so the token may be deleted.
  const exists = useY(controller.scene.elements, () => !!id && controller.scene.get(id)?.type === 'token')
  useEffect(() => {
    if (id && !exists) ref.current?.close()
  }, [id, exists])

  return (
    <Dialog dialogRef={ref} title="Token options" onClose={onClose}>
      <form
        method="dialog"
        class="dialog-form"
        onSubmit={() => {
          if (id) controller.updateToken(id, { name: name.value.trim(), style: style.value, colour: colour.value })
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
        <div class="field">
          Style
          <Segmented
            label="Token style"
            value={style.value}
            options={TOKEN_STYLES.map((s) => ({
              ...s,
              disabled: s.id === 'plain' && !token?.image,
              title: s.id === 'plain' && !token?.image ? 'Needs an image' : undefined,
            }))}
            onChange={(v) => (style.value = v)}
          />
        </div>
        <label class="field colour-field" data-disabled={style.value === 'plain'}>
          Background and border
          <span class="colour-row">
            <input
              type="color"
              class="colour-input bevel"
              value={colour.value}
              disabled={style.value === 'plain'}
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
  )
}

function SceneSettingsDialog({ campaign, sceneId, scene }: { campaign: Campaign; sceneId: string; scene: SceneDoc }) {
  const ref = useRef<HTMLDialogElement>(null)
  const grid = useY(scene.settings, () => scene.grid())
  const view = useY(campaign.scenes, () => campaign.sceneViews().find((s) => s.id === sceneId))
  const isGm = campaign.isGm()
  const shown = view ? canvasColour(view, activeMapColour.value) : DEFAULT_CANVAS_COLOUR
  const auto = !view?.canvasColour

  useSignalEffect(() => {
    if (sceneSettingsOpen.value) openPopup(ref.current)
  })

  const num = (v: string, fallback: number) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : fallback)

  return (
    <Dialog dialogRef={ref} title={view ? `${view.name} settings` : 'Scene settings'} onClose={() => (sceneSettingsOpen.value = false)}>
      <div class="field">
        Grid
        <Segmented label="Grid type" value={grid.type} options={GRID_TYPES} disabled={!isGm} onChange={(type) => scene.setGrid({ type })} />
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
            disabled={!isGm || grid.type === 'none'}
            onChange={(e) => scene.setGrid({ size: Math.max(MIN_GRID_SIZE, num(e.currentTarget.value, DEFAULT_GRID.size)) })}
          />
        </label>
        <label class="field">
          Offset X
          <input
            class="input bevel"
            type="number"
            step={1}
            value={grid.offsetX}
            disabled={!isGm || grid.type === 'none'}
            onChange={(e) => scene.setGrid({ offsetX: num(e.currentTarget.value, 0) })}
          />
        </label>
        <label class="field">
          Offset Y
          <input
            class="input bevel"
            type="number"
            step={1}
            value={grid.offsetY}
            disabled={!isGm || grid.type === 'none'}
            onChange={(e) => scene.setGrid({ offsetY: num(e.currentTarget.value, 0) })}
          />
        </label>
      </div>
      <div class="field">
        Canvas colour
        <span class="colour-row">
          <Segmented
            label="Canvas colour"
            value={auto ? 'auto' : 'custom'}
            options={[
              { id: 'auto', label: 'Auto', title: 'A dark shade of the map’s colour' },
              { id: 'custom', label: 'Custom' },
            ]}
            disabled={!isGm}
            onChange={(v) => campaign.updateScene(sceneId, { canvasColour: v === 'auto' ? null : shown })}
          />
          <input
            type="color"
            class="colour-input bevel"
            value={shown}
            aria-label="Pick a canvas colour"
            disabled={!isGm}
            onInput={(e) => campaign.updateScene(sceneId, { canvasColour: e.currentTarget.value })}
          />
        </span>
      </div>
      {!isGm && <p class="muted">Only the GM can change scene settings.</p>}
    </Dialog>
  )
}
