import { useState } from "react";

/** A value computed once on first render and kept for the component's lifetime. */
export function useConstant<T>(init: () => T): T {
  // eslint-disable-next-line react-doctor/hook-use-state -- Only the first value is kept; there is no setter.
  const [value] = useState(init);
  return value;
}
