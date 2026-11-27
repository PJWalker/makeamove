import { parseItems } from "../data/schema";
import { isObject } from "../lib/guards";
import { sceneShape } from "./schema";
import type { NewElement, SceneElement } from "./types";

/*
 * Scene elements on the system clipboard, so they paste into another scene,
 * tab or campaign. They travel as HTML, the one rich format both the copy
 * event and the async clipboard carry in Chrome and Safari, inside an
 * attribute that other apps ignore.
 */

const ATTRIBUTE = "data-makeamove-elements";

/** HTML carrying copies of `elements`, bottom to top, without what a scene gives each one. */
export function clipboardHtml(elements: readonly SceneElement[]): string {
  const copies = elements.map(({ id: _id, z: _z, createdBy: _by, ...rest }) => rest);
  const json = JSON.stringify(copies)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
  return `<meta charset="utf-8"><div ${ATTRIBUTE}="${json}"></div>`;
}

/** The JSON array in clipboard HTML, if it holds one. */
function copiesIn(html: string): unknown[] | null {
  if (!html.includes(ATTRIBUTE)) return null;
  const json = new DOMParser()
    .parseFromString(html, "text/html")
    .querySelector(`[${ATTRIBUTE}]`)
    ?.getAttribute(ATTRIBUTE);
  if (!json) return null;
  try {
    const copies: unknown = JSON.parse(json);
    return Array.isArray(copies) ? copies : null;
  } catch (error) {
    console.error("Couldn't read the scene elements on the clipboard", error);
    return null;
  }
}

/**
 * The elements in clipboard HTML, bottom to top, or null if it holds none.
 * They're checked as the scene checks what a peer sends: any it can't use
 * are logged and left out.
 */
export function elementsFromClipboard(html: string): NewElement[] | null {
  const copies = copiesIn(html);
  if (!copies) return null;
  const stored = new Map(
    copies.map((copy, index) => [
      String(index),
      isObject(copy) ? { z: "a0", createdBy: "", ...copy } : copy,
    ]),
  );
  const elements = parseItems(sceneShape.elements, stored);
  return [...elements]
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, { id: _id, z: _z, createdBy: _by, ...rest }]): NewElement => rest);
}
