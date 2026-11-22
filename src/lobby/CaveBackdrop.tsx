import { useEffect, useRef, useState } from "react";
import { IconPause, IconPlay } from "../ui/icons";
import { stageCave } from "./caveStage";
import type { CavePlayback } from "./caveStage";

/**
 * The lobby's backdrop: an adventuring party seen from behind, making their
 * way down a cave by torchlight and a wizard's wisp, drawn as Gaussian splats
 * (caveScene.ts, caveStage.ts).
 */
export function CaveBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playbackRef = useRef<CavePlayback | null>(null);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!canvasRef.current) return undefined;
    let disposed = false;
    void stageCave(canvasRef.current, setPaused).then((controls) => {
      if (disposed) controls.dispose();
      else playbackRef.current = controls;
    });
    return () => {
      disposed = true;
      playbackRef.current?.dispose();
      playbackRef.current = null;
    };
  }, []);
  const toggle = () => {
    if (paused) playbackRef.current?.play();
    else playbackRef.current?.pause();
  };
  return (
    <div className="cave-backdrop">
      <canvas className="cave-canvas" ref={canvasRef} />
      <button
        type="button"
        className="cave-playback"
        aria-label={paused ? "Play cave animation" : "Pause cave animation"}
        title={paused ? "Play" : "Pause"}
        onClick={toggle}
      >
        {paused ? <IconPlay size={16} /> : <IconPause size={16} />}
      </button>
    </div>
  );
}
