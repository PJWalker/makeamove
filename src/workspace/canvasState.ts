import { store } from "../lib/store";
import type { SceneDoc } from "../scene/sceneDoc";
import type { SceneController } from "../scene/controller";
import type { Point } from "../scene/grid";
import type { BlobRef } from "../media/images";
import type { TokenStyle } from "../scene/types";
import type { EntityGraphic, EntityGraphicRef } from "../media/images";
import type { AreaSpec } from "../systems/types";
import { backdropColour } from "../lib/colour";
import { DEFAULT_CANVAS_COLOUR, type SceneView } from "../campaign/campaign";

/*
 * State shared between the scene canvas (loaded lazily, with PixiJS) and the
 * rest of the tabletop chrome, which shouldn't have to import it. One per
 * open campaign (see CampaignContext).
 */

/**
 * The colour behind a scene's maps: the GM's choice, or (auto) a darkened
 * version of the map's colour, or a neutral default before there's a map.
 */
export function canvasColour(scene: SceneView, mapColour: string | null): string {
  return scene.canvasColour ?? (mapColour ? backdropColour(mapColour) : DEFAULT_CANVAS_COLOUR);
}

/** What a character's token needs when it's dropped on the map. */
export interface TokenSpec {
  name: string;
  characterId?: string;
  image?: BlobRef;
  icon?: string;
  itemDefId?: string;
  style?: TokenStyle;
  colour?: string;
  graphic?: EntityGraphic;
  entityRef?: EntityGraphicRef;
}

/** The open scene's canvas, for the commands that work on it (commands/selection.ts). */
export interface CanvasCommands {
  sceneId: string;
  scene: SceneDoc;
  controller: SceneController;
  /** Open a token's options pop-up, on its sheet or its token tab. */
  tokenOptions(id: string, tab: "character" | "token"): void;
  /** Ask for image files to put on the scene at a point. */
  importImagesAt(at: Point): void;
}

/** A character token under a screen point, including whether it can be edited here. */
export interface SceneCharacterHit {
  characterId: string;
  tokenId: string;
  editable: boolean;
  center: { x: number; y: number };
}

export class CanvasState {
  /** Set to true to open the active scene's settings. */
  readonly sceneSettingsOpen = store(false);

  /** Dominant colour of the active scene's main map, for the UI tint. */
  readonly activeMapColour = store<string | null>(null);

  /** Map colours of scenes opened this session, so the scene list can show them. */
  readonly seenMapColours = store<Record<string, string | null>>({});

  /**
   * While an action asks for targets: how many it takes at most, and the acting
   * character. The open scene canvas lets clicks on tokens target them.
   */
  readonly targetPick = store<{ max?: number; actor?: string } | null>(null);

  /** The targets chosen on the open scene, with distances from the actor's token in scene units. */
  readonly chosenTargets = store<
    { id: string; name: string; characterId?: string; distance: number | null }[]
  >([]);

  /**
   * An action's area of effect to place on the open scene (5.5e's cones and
   * spheres), in scene units; the canvas places it and targets what it
   * covers, then sets `placedArea` to the new shape's id.
   */
  readonly areaRequest = store<{ area: AreaSpec; actor?: string; n: number } | null>(null);
  readonly placedArea = store<string | null>(null);

  /** Formats a distance in the open scene's units; set by the scene canvas. */
  readonly sceneDistance = store<(d: number) => string>((d) => `${d}`);

  /**
   * Set by the open scene canvas: puts a token at a screen point and returns
   * whether the point was over the map.
   */
  readonly tokenDrop = store<((x: number, y: number, spec: TokenSpec) => boolean) | null>(null);

  /** Resolve a character token under a screen point; set by the open scene canvas. */
  readonly sceneCharacterAt = store<((x: number, y: number) => SceneCharacterHit | null) | null>(
    null,
  );
  readonly sceneDropHighlight = store<string | null>(null);
  readonly sceneDropFlash = store<{ tokenId: string; nonce: number } | null>(null);
  #dropFlashNonce = 0;

  flashSceneDrop(tokenId: string) {
    this.sceneDropFlash.value = { tokenId, nonce: ++this.#dropFlashNonce };
  }

  readonly canvasCommands = store<CanvasCommands | null>(null);

  /** Open one of the campaign's dialogs (from the campaign menu or the command palette). */
  readonly dialogRequest = store<"settings" | "help" | "relationships" | null>(null);
}
