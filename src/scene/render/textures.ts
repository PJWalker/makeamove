import { ImageSource, Texture } from "pixi.js";
import { tokenIconUrl } from "../../ui/entryIcons";
import { forgetBitmaps, loadBitmap, type PeerBlobs } from "../../media/images";

const textures = new Map<string, Promise<Texture | null>>();

/** Free every texture; call when the last renderer goes away. */
export function releaseTextures() {
  for (const p of textures.values()) void p.then((t) => t?.destroy(true));
  textures.clear();
  forgetBitmaps();
}

/** An image's texture, loaded once and shared; null if it isn't on this device yet. */
export function textureFor(hash: string, peers: PeerBlobs | null): Promise<Texture | null> {
  let p = textures.get(hash);
  if (!p) {
    p = loadBitmap(hash, peers).then((bitmap) =>
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
    void p.then((t) => t || textures.get(hash) !== p || textures.delete(hash));
  }
  return p;
}

/** A library icon's texture for a token, loaded once and shared; null if it can't load. */
export function iconTextureFor(name: string): Promise<Texture | null> {
  const url = tokenIconUrl(name);
  let p = textures.get(url);
  if (!p) {
    const image = new Image();
    image.src = url;
    p = image.decode().then(
      () =>
        new Texture({
          source: new ImageSource({ resource: image, autoGenerateMipmaps: true }),
        }),
      (error: unknown) => {
        console.error(`Couldn't load token icon ${name}`, error);
        return null;
      },
    );
    textures.set(url, p);
  }
  return p;
}
