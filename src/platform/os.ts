/** Whether this device runs macOS (or iOS), whose conventions some of the interface follows. */
export const IS_MAC =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
