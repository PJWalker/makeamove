/*
 * Scene elements as plain values. Each is stored as a Y.Map of these fields
 * in the scene's subdocument (see sceneDoc.ts).
 *
 * Every element has a centre (x, y), a size (w, h) and a rotation in
 * radians, all in world px. z is a fractional index ordering it within its
 * layer.
 */

/** Bottom to top. Fog and presence layers arrive with M5 and M2. */
export const LAYERS = ['map', 'under', 'token', 'over'] as const
export type Layer = (typeof LAYERS)[number]

export type ElementType = 'map' | 'token' | 'drawing' | 'shape' | 'text' | 'wall' | 'light' | 'area'

/** An image in the blob store; the CRDT holds only this reference. */
export interface BlobRef {
  hash: string
  mime: string
  width: number
  height: number
}

export interface Transform {
  x: number
  y: number
  w: number
  h: number
  rot: number
}

interface Base extends Transform {
  id: string
  layer: Layer
  z: string
  locked: boolean
  createdBy: string
}

export interface MapElement extends Base {
  type: 'map'
  image: BlobRef
}

/**
 * How a token is drawn: 'disc' crops its image to a circle on a coloured
 * background with a ring; 'plain' shows the image as it is (for cut-out art).
 */
export type TokenStyle = 'disc' | 'plain'

export const TOKEN_STYLES: { id: TokenStyle; label: string }[] = [
  { id: 'disc', label: 'Round with border' },
  { id: 'plain', label: 'Image as is' },
]

export interface TokenElement extends Base {
  type: "token";
  image?: BlobRef;
  /** A bundled entry icon, rendered when the token has no image. */
  icon?: string;
  /** The gear definition represented by an item token. */
  itemDefId?: string;
  name: string;
  /** Background and ring colour of a disc token. */
  colour: string;
  /** Missing on tokens from before styles existed, which are discs. */
  style?: TokenStyle;
  /** The character this token stands for; the system decides which of its stats show. */
  characterId?: string;
  /** Hide its name under it. */
  hideName?: boolean;
  /** Hide the bars its character's system shows (HP). */
  hideBars?: boolean;
}

/** A token is only drawn plain if it has an image to show. */
export const isPlainToken = (el: SceneElement) => el.type === 'token' && el.style === 'plain' && !!el.image

export interface DrawingElement extends Base {
  type: 'drawing'
  /** Flat [x, y, pressure, …] relative to the centre, at the size bw × bh. */
  points: number[]
  colour: string
  /** Stroke width at the original size. */
  width: number
  bw: number
  bh: number
}

/**
 * A shape's outline in its own frame, w × h about its centre: a rectangle,
 * an ellipse, a line along its length (w) as thick as h, or a cone opening
 * from the middle of its left edge to its right edge.
 */
export type ShapeKind = 'rect' | 'circle' | 'line' | 'cone'

export interface ShapeElement extends Base {
  type: 'shape'
  shape: ShapeKind
  colour: string
  /** Outline width; the inside is tinted with the colour. */
  width: number
  /** Set when placed as an action's area of effect: who placed it, for clearing. */
  template?: boolean
}

export interface TextElement extends Base {
  type: 'text'
  text: string
  colour: string
  /** Font size at w × h; resizing scales it. */
  size: number
  /** The size w × h the text was laid out at. */
  bw: number
  bh: number
}

/**
 * A wall (M12): a segment along its length (w) through its centre, at its
 * rotation, that blocks sight and light. A door is a wall the GM can open.
 * Only the GM sees walls.
 */
export interface WallElement extends Base {
  type: 'wall'
  door?: boolean
  open?: boolean
}

/** A light (M12): bright light out to one radius, dim light out to another, in world px. Only the GM sees the lamp itself. */
export interface LightElement extends Base {
  type: 'light'
  bright: number
  dim: number
  colour: string
  /** Whether it wavers like a flame. */
  flicker?: boolean
}

/** Whether an area is lit whatever the lights do, or dark whatever they do. */
export type AreaTone = 'light' | 'dark'

/** How the GM sees an area of solid light or dark. */
export const AREA_COLOURS: Record<AreaTone, string> = { light: '#ffe29a', dark: '#9b8cff' }

/**
 * An area of solid light or dark (M12): a polygon, its points flat [x, y, …]
 * relative to the centre at the size bw × bh. Only the GM sees its outline.
 */
export interface AreaElement extends Base {
  type: 'area'
  tone: AreaTone
  points: number[]
  bw: number
  bh: number
}

export type SceneElement = MapElement | TokenElement | DrawingElement | ShapeElement | TextElement | WallElement | LightElement | AreaElement

/** What callers supply when adding an element; the store fills in the rest. */
export type NewElement = DistributiveOmit<SceneElement, 'id' | 'z' | 'createdBy' | 'locked'> & { locked?: boolean }

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

export const SHAPES: { id: ShapeKind; label: string }[] = [
  { id: 'rect', label: 'Square' },
  { id: 'circle', label: 'Circle' },
  { id: 'line', label: 'Line' },
  { id: 'cone', label: 'Cone' },
]
