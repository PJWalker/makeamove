import { signal } from '@preact/signals'
import type { EntityGraphic, EntityGraphicRef } from "../graphics";
import type { TokenStyle } from "../scene/types";
import type { AreaSpec } from '../systems/types'
import { backdropColour } from '../lib/colour'
import { DEFAULT_CANVAS_COLOUR, type SceneView } from '../store/campaign'

/*
 * State shared between the scene canvas (loaded lazily, with PixiJS) and the
 * rest of the tabletop chrome, which shouldn't have to import it.
 */

/** Set to true to open the active scene's settings. */
export const sceneSettingsOpen = signal(false)

/** Dominant colour of the active scene's main map, for the UI tint. */
export const activeMapColour = signal<string | null>(null)

/** Map colours of scenes opened this session, so the scene list can show them. */
export const seenMapColours = signal<Record<string, string | null>>({})

/**
 * The colour behind a scene's maps: the GM's choice, or (auto) a darkened
 * version of the map's colour, or a neutral default before there's a map.
 */
export function canvasColour(scene: SceneView, mapColour: string | null): string {
  return scene.canvasColour ?? (mapColour ? backdropColour(mapColour) : DEFAULT_CANVAS_COLOUR)
}

/**
 * While an action asks for targets: how many it takes at most, and the acting
 * character. The open scene canvas lets clicks on tokens target them.
 */
export const targetPick = signal<{ max?: number; actor?: string } | null>(null)

/** The targets chosen on the open scene, with distances from the actor's token in scene units. */
export const chosenTargets = signal<{ id: string; name: string; characterId?: string; distance: number | null }[]>([])

/**
 * An action's area of effect to place on the open scene (5.5e's cones and
 * spheres), in scene units; the canvas places it and targets what it
 * covers, then sets `placedArea` to the new shape's id.
 */
export const areaRequest = signal<{ area: AreaSpec; actor?: string; n: number } | null>(null)
export const placedArea = signal<string | null>(null)

/** Formats a distance in the open scene's units; set by the scene canvas. */
export const sceneDistance = signal<(d: number) => string>((d) => `${d}`)

/** What a character's token needs when it's dropped on the map. */
export interface TokenSpec {
  name: string;
  characterId?: string;
  graphic?: EntityGraphic;
  entityRef?: EntityGraphicRef;
  itemDefId?: string;
  style?: TokenStyle;
  colour?: string;
}

/**
 * Set by the open scene canvas: puts a token at a screen point and returns
 * whether the point was over the map.
 */
export const tokenDrop = signal<((x: number, y: number, spec: TokenSpec) => boolean) | null>(null)

/** Resolve a character token under a screen point, including whether it can be edited here. */
export const sceneCharacterAt = signal<
  ((x: number, y: number) => { characterId: string; tokenId: string; editable: boolean; center: { x: number; y: number } } | null) | null
>(null)
export const sceneDropHighlight = signal<string | null>(null)
export const sceneDropFlash = signal<{ tokenId: string; nonce: number } | null>(null)
let dropFlashNonce = 0

export function flashSceneDrop(tokenId: string) {
  sceneDropFlash.value = { tokenId, nonce: ++dropFlashNonce }
}

const AUTOHIDE_KEY = 'mam:autohide'

/** Sidebars and toolbars stay hidden until the pointer nears their edge (Ctrl/Cmd + \\ toggles it). Per device. */
export const autohide = signal(loadAutohide())

function loadAutohide() {
  try {
    return localStorage.getItem(AUTOHIDE_KEY) === 'true'
  } catch {
    return false
  }
}

export function setAutohide(on: boolean) {
  autohide.value = on
  try {
    localStorage.setItem(AUTOHIDE_KEY, String(on))
  } catch {
    // Just won't persist.
  }
}

/** What the command palette can ask of the open scene's canvas. */
export interface CanvasCommands {
  fit(): void
  undo(): void
  redo(): void
}
export const canvasCommands = signal<CanvasCommands | null>(null)

/** Open one of the campaign's dialogs (from the campaign menu or the command palette). */
export const dialogRequest = signal<'settings' | 'help' | 'relationships' | null>(null)
