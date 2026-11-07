import { Graphics, ImageSource, Texture } from "pixi.js";
import { entryIconSvg } from "../../ui/entryIcons";
import { forgetBitmaps, loadBitmap } from "../images";

const textures = new Map<string, Promise<Texture | null>>();

/** Free every texture; call when the last renderer goes away. */
export function releaseTextures() {
  for (const p of textures.values()) p.then((t) => t?.destroy(true));
  textures.clear();
  forgetBitmaps();
}

/** An image's texture, loaded once and shared; null if it isn't on this device yet. */
export function textureFor(hash: string): Promise<Texture | null> {
  let p = textures.get(hash);
  if (!p) {
    p = loadBitmap(hash).then((bitmap) =>
      bitmap
        ? new Texture({
            source: new ImageSource({
              resource: bitmap,
              autoGenerateMipmaps: true,
            }),
          })
        : null,
    );
    textures.set(hash, p);
    // A miss isn't final; a peer may supply it later.
    p.then((t) => t || textures.get(hash) !== p || textures.delete(hash));
  }
  return p;
}

/** A token's icon, scaled to fit its 100 px body and centred. */
export function iconGraphicFor(name: string): Graphics | null {
  const graphic = new Graphics();
  try {
    graphic.svg(entryIconSvg(name));
  } catch (error) {
    console.warn(`Couldn't draw token icon ${name}`, error);
    return null;
  }
  const bounds = graphic.bounds;
  if (!bounds.width || !bounds.height) return null;
  const scale = 56 / Math.max(bounds.width, bounds.height);
  graphic.scale.set(scale);
  graphic.position.set(
    -(bounds.x + bounds.width / 2) * scale,
    -(bounds.y + bounds.height / 2) * scale,
  );
  return graphic;
}
