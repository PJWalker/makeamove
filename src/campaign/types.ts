import type { GridType } from "../scene/grid"
import type { TokenStyle } from "../scene/types"

export type Role = "gm" | "player" | "observer"
export type Visibility = "everyone" | "owners" | "gm"

export interface RevokedView {
  id: string
  name: string
  at: number
}

export interface MemberView {
  id: string
  name: string
  role: Role
  activeSceneId: string | null
}

export interface SceneView {
  id: string
  name: string
  folder?: string
  canvasColour: string | null
  order: string
  visibility: Visibility
}

export interface CampaignDefaults {
  tokenStyle: TokenStyle
  gridType: GridType
}