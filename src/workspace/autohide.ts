import { store } from "../lib/store";
import { getStorageItem, setStorageItem } from "../platform/localStorage";

const AUTOHIDE_KEY = "mam:autohide";

/**
 * Sidebars and toolbars stay hidden until the pointer nears their edge
 * (Ctrl/Cmd + \\ toggles it). A preference of this device, in every campaign.
 */
export const autohide = store(getStorageItem(AUTOHIDE_KEY) === "true");

export function setAutohide(on: boolean) {
  autohide.value = on;
  setStorageItem(AUTOHIDE_KEY, String(on));
}
