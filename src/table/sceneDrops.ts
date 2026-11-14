import { toScreen } from "../scene/camera";
import { SceneController } from "../scene/controller";
import type { SceneElement } from "../scene/types";
import type { Campaign } from "../campaign/campaign";
import { canEdit, getCharacter } from "../features/characters/api";
import { tokenName } from "../features/characters/templates";
import { dropOn, dropTargetAt, setDropCursor } from "../workspace/entityDrag";
import { itemTokenEntity } from "../workspace/dragEntities";
import type { CampaignContext } from "../workspace/campaignContext";
import { copyCharacter } from "../workspace/commands/characters";

/** Stop showing where an item token would land. */
function clearDropHint(ctx: CampaignContext) {
  document.documentElement.classList.remove("is-reordering");
  setDropCursor(null);
  ctx.canvas.sceneDropHighlight.set(null);
}

/**
 * How things dropped on a scene, and dragged out of it, reach the table: character and item tokens
 * dropped on the canvas, the character under a point, item tokens dragged onto sheets, and copies of
 * template characters. Returns the function that takes it all down again.
 */
export function bindSceneDrops(
  ctx: CampaignContext,
  campaign: Campaign,
  ctl: SceneController,
  host: HTMLElement,
): () => void {
  ctx.canvas.tokenDrop.set((x, y, spec) => {
    // A template's token is a new copy of it, with a name of its own.
    if (spec.characterId) {
      const c = getCharacter(campaign, spec.characterId);
      if (c?.template) {
        const name = tokenName(c, c.template, ctl.tokenNames());
        const copy = ctx.execute(copyCharacter, { template: c.id, name });
        if (copy) spec = { ...spec, name, characterId: copy };
      }
      ctl.addCharacterToken(
        ctl.toWorld(x, y),
        spec as Required<Pick<typeof spec, "characterId" | "name">> & typeof spec,
      );
    } else {
      ctl.addToken(ctl.toWorld(x, y), spec.name, spec);
    }
    return true;
  });
  ctx.canvas.sceneCharacterAt.set((x, y) => {
    const hit = ctl.hitTest(ctl.toWorld(x, y), true, true);
    if (hit?.type !== "token" || !hit.characterId) return null;
    const character = getCharacter(campaign, hit.characterId);
    const bounds = host.getBoundingClientRect();
    const screen = toScreen(ctl.renderer.camera, hit);
    return {
      characterId: hit.characterId,
      tokenId: hit.id,
      editable: !!character && canEdit(campaign, character),
      center: { x: bounds.left + screen.x, y: bounds.top + screen.y },
    };
  });
  ctl.onItemTokenDragMove = (token, event) => {
    if (!token) return clearDropHint(ctx);
    const dragged = itemTokenEntity(ctx, token);
    const target = dragged ? dropTargetAt(ctx.canvas, event.clientX, event.clientY, dragged) : null;
    document.documentElement.classList.add("is-reordering");
    setDropCursor(!!target);
    ctx.canvas.sceneDropHighlight.set(target?.tokenId ?? null);
  };
  ctl.onItemTokenDrop = (token, event) => {
    const dragged = itemTokenEntity(ctx, token);
    const target = dragged ? dropTargetAt(ctx.canvas, event.clientX, event.clientY, dragged) : null;
    clearDropHint(ctx);
    if (!target) {
      const overCanvas = host.contains(document.elementFromPoint(event.clientX, event.clientY));
      if (overCanvas) return false;
      ctl.renderer.previews.delete(token.id);
      ctl.renderer.invalidate("previews", "overlay");
      return true;
    }
    if (target.element.matches(".scene-canvas") && !target.tokenId) return false;
    const destination = target.tokenCenter ?? { x: event.clientX, y: event.clientY };
    ctl.animateItemTokenDrop(token.id, destination.x, destination.y, () => {
      dropOn(ctx.canvas, target, dragged!, event.clientX, event.clientY);
      ctl.scene.remove([token.id]);
      ctl.selection.value = ctl.selection.value.filter((id) => id !== token.id);
    });
    return true;
  };
  // A duplicated copy's token gets a copy of its own, from the same template.
  ctl.afterDuplicate = (ids) => {
    const patches: [string, Partial<SceneElement>][] = [];
    for (const id of ids) {
      const el = ctl.scene.get(id);
      const copy = el?.type === "token" ? getCharacter(campaign, el.characterId) : undefined;
      const template = copy?.base ? getCharacter(campaign, copy.base) : undefined;
      if (!template?.template) continue;
      const name = tokenName(template, template.template, ctl.tokenNames());
      const characterId = ctx.execute(copyCharacter, { template: template.id, name });
      if (characterId) patches.push([id, { name, characterId }]);
    }
    if (patches.length) ctl.scene.update(patches);
  };
  return () => {
    ctx.canvas.tokenDrop.set(null);
    ctx.canvas.sceneCharacterAt.set(null);
    ctx.canvas.sceneDropHighlight.set(null);
    ctl.onItemTokenDragMove = null;
    ctl.onItemTokenDrop = null;
  };
}
