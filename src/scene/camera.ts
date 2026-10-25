import type { Point } from './grid'

/** screen = world × zoom + (x, y) */
export interface Camera {
  x: number
  y: number
  zoom: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export const MIN_ZOOM = 0.05
export const MAX_ZOOM = 8

export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

export const toWorld = (cam: Camera, p: Point): Point => ({ x: (p.x - cam.x) / cam.zoom, y: (p.y - cam.y) / cam.zoom })
export const toScreen = (cam: Camera, p: Point): Point => ({ x: p.x * cam.zoom + cam.x, y: p.y * cam.zoom + cam.y })

/** Zoom by `factor`, keeping the world point under screen point `at` fixed. */
export function zoomAt(cam: Camera, at: Point, factor: number): Camera {
  const zoom = clampZoom(cam.zoom * factor)
  const w = toWorld(cam, at)
  return { x: at.x - w.x * zoom, y: at.y - w.y * zoom, zoom }
}

/** The world-space rectangle visible in a viewport of the given size. */
export function visibleWorld(cam: Camera, width: number, height: number): Rect {
  const tl = toWorld(cam, { x: 0, y: 0 })
  return { x: tl.x, y: tl.y, w: width / cam.zoom, h: height / cam.zoom }
}

/** A camera that shows `bounds` centred in the viewport, with some padding. */
export function fitCamera(bounds: Rect, width: number, height: number, padding = 48, maxZoom = 1): Camera {
  const zoom = clampZoom(
    Math.min(maxZoom, (width - 2 * padding) / Math.max(1, bounds.w), (height - 2 * padding) / Math.max(1, bounds.h)),
  )
  return {
    x: width / 2 - (bounds.x + bounds.w / 2) * zoom,
    y: height / 2 - (bounds.y + bounds.h / 2) * zoom,
    zoom,
  }
}
