/*
 * Times work on the GPU, where the browser allows it
 * (EXT_disjoint_timer_query_webgl2). Results arrive a frame or two later;
 * timings the GPU marks as disrupted are dropped.
 */

export interface GpuTimer {
  /** Runs `work`, timing the GPU commands it issues. */
  measure: (work: () => void) => void;
  /** The milliseconds each finished measurement took, oldest first. */
  collect: () => number[];
  dispose: () => void;
}

/** The extension's constants. */
const TIME_ELAPSED = 0x88_BF;
const GPU_DISJOINT = 0x8F_BB;
const NANOSECONDS_PER_MILLISECOND = 1e6;

export function gpuTimer(gl: WebGL2RenderingContext): GpuTimer | undefined {
  if (!gl.getExtension("EXT_disjoint_timer_query_webgl2")) return undefined;
  const pending: WebGLQuery[] = [];
  return {
    measure(work) {
      const query = gl.createQuery();
      gl.beginQuery(TIME_ELAPSED, query);
      try {
        work();
      } finally {
        gl.endQuery(TIME_ELAPSED);
        pending.push(query);
      }
    },
    collect() {
      const disjoint = Boolean(gl.getParameter(GPU_DISJOINT));
      const finished: number[] = [];
      while (pending.length > 0) {
        const [query] = pending;
        if (!query || !gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) break;
        pending.shift();
        const nanoseconds = Number(gl.getQueryParameter(query, gl.QUERY_RESULT));
        if (!disjoint) finished.push(nanoseconds / NANOSECONDS_PER_MILLISECOND);
        gl.deleteQuery(query);
      }
      return finished;
    },
    dispose() {
      for (const query of pending) gl.deleteQuery(query);
      pending.length = 0;
    },
  };
}
