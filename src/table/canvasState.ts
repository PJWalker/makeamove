import { signal } from '@preact/signals'
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
