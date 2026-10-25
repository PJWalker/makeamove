import { signal } from '@preact/signals'
import type { Layer } from './types'

export type ToolId = 'select' | 'pan' | 'draw' | 'erase' | 'shape' | 'text' | 'ruler' | 'ping' | 'fog'

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
