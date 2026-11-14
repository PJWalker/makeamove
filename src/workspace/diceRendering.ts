import { store } from "../lib/store";
import { getStorageItem, setStorageItem } from "../platform/localStorage";

const THREE_DIMENSIONAL_DICE_KEY = "mam:3d-dice";

/** Whether dice on this device use the 3D renderer. */
export const threeDimensionalDice = store(getStorageItem(THREE_DIMENSIONAL_DICE_KEY) !== "false");

export function setThreeDimensionalDice(on: boolean) {
  threeDimensionalDice.value = on;
  setStorageItem(THREE_DIMENSIONAL_DICE_KEY, String(on));
}
