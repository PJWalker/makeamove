import { useEffect, useRef } from "react";
import { stageCave } from "./caveStage";

/**
 * The lobby's backdrop: an adventuring party seen from behind, making their
 * way down a cave by torchlight and a wizard's wisp, drawn as Gaussian splats
 * (caveScene.ts, caveStage.ts).
 */
export function CaveBackdrop() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => (canvas.current ? stageCave(canvas.current) : undefined), []);
  return (
    <div className="cave-backdrop" aria-hidden="true">
      <canvas className="cave-canvas" ref={canvas} />
    </div>
  );
}
