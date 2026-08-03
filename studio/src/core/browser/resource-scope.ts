type Cleanup = () => void | Promise<void>;

export class ResourceScope {
  readonly #cleanups = new Set<Cleanup>();
  #disposed = false;

  add(cleanup: Cleanup): () => void {
    if (this.#disposed) {
      void cleanup();
      return () => undefined;
    }
    this.#cleanups.add(cleanup);
    return () => this.#cleanups.delete(cleanup);
  }

  createObjectUrl(value: Blob | MediaSource): string {
    const url = URL.createObjectURL(value);
    this.add(() => URL.revokeObjectURL(url));
    return url;
  }

  ownWorker(worker: Worker): Worker {
    this.add(() => worker.terminate());
    return worker;
  }

  ownAbortController(controller = new AbortController()): AbortController {
    this.add(() => controller.abort());
    return controller;
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    const cleanups = [...this.#cleanups].reverse();
    this.#cleanups.clear();
    await Promise.allSettled(cleanups.map((cleanup) => cleanup()));
  }
}
