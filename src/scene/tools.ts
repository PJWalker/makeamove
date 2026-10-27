import { signal } from '@preact/signals'
import type { Layer, ShapeKind } from './types'

export type ToolId = 'select' | 'pan' | 'draw' | 'erase' | 'shape' | 'text' | 'ruler' | 'ping' | 'wall' | 'light'

export const activeTool = signal<ToolId>('select')

/*
 * Pen settings, remembered per device.
 */
export const PEN_WIDTHS = [3, 6, 12]

interface PenSettings {
  colour: string
  width: number
  layer: Extract<Layer, 'under' | 'over'>
}

const PEN_KEY = 'mam:pen'

function loadPen(): PenSettings {
  // Gold, like the UI accent.
  const fallback: PenSettings = { colour: '#f0bb3b', width: PEN_WIDTHS[1], layer: 'over' }
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(PEN_KEY) ?? '{}') }
  } catch {
    return fallback
  }
}

export const pen = signal<PenSettings>(loadPen())

export function setPen(patch: Partial<PenSettings>) {
  pen.value = { ...pen.value, ...patch }
  try {
    localStorage.setItem(PEN_KEY, JSON.stringify(pen.value))
  } catch {
    // Settings just won't persist.
  }
}

/** Eraser radius in screen px. */
export const ERASER_RADIUS = 14

/** The shape the Shapes tool draws, remembered per device. */
const SHAPE_KEY = 'mam:shape'
function loadShape(): ShapeKind {
  try {
    const v = localStorage.getItem(SHAPE_KEY)
    return v === 'circle' || v === 'line' || v === 'cone' ? v : 'rect'
  } catch {
    return 'rect'
  }
}
export const shapeTool = signal<ShapeKind>(loadShape())
export function setShapeTool(shape: ShapeKind) {
  shapeTool.value = shape
  try {
    localStorage.setItem(SHAPE_KEY, shape)
  } catch {
    // Just won't persist.
  }
}

/** Outline width of drawn shapes, in world px. */
export const SHAPE_WIDTH = 3

/** How an action's area of effect is drawn: the accent, under tokens so they stay clear. */
export const TEMPLATE_STYLE = { colour: '#f0c23b', width: 3, layer: 'under' as Layer }
