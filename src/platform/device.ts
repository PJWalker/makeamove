import { store } from "../lib/store";
import { newId } from "../lib/ids";
import { getStorageJson, setStorageJson } from "./localStorage";

/**
 * This browser's identity. M0 uses a random id; M2 replaces it with a
 * WebCrypto keypair whose public key becomes the id.
 */
export interface Device {
  id: string;
  name: string;
  /** Chosen colour for cursors, pings and new tokens; derived from the id if unset. */
  colour?: string;
}

const KEY = "mam:device";

function load(): Device {
  const saved = getStorageJson<Device | null>(KEY, null);
  if (saved) return saved;
  const fresh: Device = { id: newId(), name: "" };
  save(fresh);
  return fresh;
}

function save(d: Device) {
  setStorageJson(KEY, d);
}

export const device = store<Device>(load());

export function setDeviceName(name: string) {
  device.value = { ...device.value, name };
  save(device.value);
}

export function setDeviceColour(colour: string) {
  device.value = { ...device.value, colour };
  save(device.value);
}
