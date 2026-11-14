import { useState } from "react";

/** A value computed once on first render and kept for the component's lifetime. */
export function useConstant<T>(init: () => T): T {
  // react-doctor-disable-next-line react-doctor/hook-use-state
  const [value] = useState(init);
  return value;
}
