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

export type ElementType = 'map' | 'token' | 'drawing'

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
  type: 'token'
  image?: BlobRef
  name: string
  /** Background and ring colour of a disc token. */
  colour: string
  /** Missing on tokens from before styles existed, which are discs. */
  style?: TokenStyle
  /** The character this token stands for; the system decides which of its stats show. */
  characterId?: string
  /** Hide its name under it. */
  hideName?: boolean
  /** Hide the bars its character's system shows (HP). */
  hideBars?: boolean
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

export type SceneElement = MapElement | TokenElement | DrawingElement

/** What callers supply when adding an element; the store fills in the rest. */
export type NewElement = DistributiveOmit<SceneElement, 'id' | 'z' | 'createdBy' | 'locked'> & { locked?: boolean }

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

export const layerOf = (type: ElementType): Layer => (type === 'map' ? 'map' : type === 'token' ? 'token' : 'over')
