import { signal } from '@preact/signals'
import type { BlobRef, TokenStyle } from '../scene/types'
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

/** What a character's token needs when it's dropped on the map. */
export interface TokenSpec {
  characterId: string
  name: string
  image?: BlobRef
  style?: TokenStyle
  colour?: string
}

/**
 * Set by the open scene canvas: puts a token at a screen point and returns
 * whether the point was over the map.
 */
export const tokenDrop = signal<((x: number, y: number, spec: TokenSpec) => boolean) | null>(null)

/** Ctrl/Cmd + \ hides all chrome. */
export const chromeHidden = signal(false)

/** What the command palette can ask of the open scene's canvas. */
export interface CanvasCommands {
  fit(): void
  undo(): void
  redo(): void
}
export const canvasCommands = signal<CanvasCommands | null>(null)

/** Open one of the campaign's dialogs (from the campaign menu or the command palette). */
export const dialogRequest = signal<'player' | 'settings' | 'help' | null>(null)
