/*
 * Request and response over a Web Worker. Tasks and results are unions
 * discriminated by `type`; each task gets the result of the same type.
 *
 *   main:    const run = workerClient<Task, Result>(() => new Worker(...), "Image worker")
 *            const { colour } = await run({ type: "colour", blob })
 *   worker:  serveWorker<Task, Result>(handle, (result) => transferables)
 */

type Typed = { type: string };

type Request<Task> = { id: number; task: Task };
type Response<Result> = { id: number; result: Result } | { id: number; error: string };

export type WorkerRun<Task extends Typed, Result extends Typed> = <T extends Task["type"]>(
  task: Extract<Task, { type: T }>,
  transfer?: Transferable[],
) => Promise<Extract<Result, { type: T }>>;

/**
 * Start the worker on first use, and again after it fails. `discard` cleans
 * up a result nobody is waiting for any more (an ImageBitmap, say).
 */
export function workerClient<Task extends Typed, Result extends Typed>(
  create: () => Worker,
  name: string,
  discard?: (result: Result) => void,
): WorkerRun<Task, Result> {
  let worker: Worker | null = null;
  let nextId = 0;
  const pending = new Map<
    number,
    { resolve: (result: Result) => void; reject: (error: Error) => void }
  >();

  const fail = (failed: Worker, error: Error) => {
    if (worker === failed) worker = null;
    failed.terminate();
    for (const p of pending.values()) p.reject(error);
    pending.clear();
  };

  const start = () => {
    if (worker) return worker;
    const w = create();
    w.onmessage = ({ data }: MessageEvent<Response<Result>>) => {
      const p = pending.get(data.id);
      if (!p) {
        if ("result" in data) discard?.(data.result);
        return;
      }
      pending.delete(data.id);
      if ("error" in data) p.reject(new Error(data.error));
      else p.resolve(data.result);
    };
    w.onerror = (event) => {
      event.preventDefault();
      fail(w, new Error(event.message || `${name} failed`));
    };
    w.onmessageerror = () => fail(w, new Error(`Could not read ${name.toLowerCase()} response`));
    worker = w;
    return w;
  };

  return (task, transfer = []) => {
    const id = ++nextId;
    const w = start();
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve: resolve as (result: Result) => void, reject });
      try {
        w.postMessage({ id, task } satisfies Request<Task>, transfer);
      } catch (error) {
        pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  };
}

type WorkerScope = {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

/** Answer a workerClient's tasks, inside the worker. */
export function serveWorker<Task extends Typed, Result extends Typed>(
  handle: (task: Task) => Promise<Result>,
  transferOf: (result: Result) => Transferable[] = () => [],
) {
  const scope = globalThis as unknown as WorkerScope;
  scope.onmessage = ({ data }: MessageEvent<Request<Task>>) => {
    void handle(data.task).then(
      (result) =>
        scope.postMessage({ id: data.id, result } satisfies Response<Result>, transferOf(result)),
      (error: unknown) =>
        scope.postMessage({
          id: data.id,
          error: error instanceof Error ? error.message : String(error),
        } satisfies Response<Result>),
    );
  };
}
