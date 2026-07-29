export type PromiseTask<T> = () => Promise<T> | T;

export class PromiseQueue {
  private tail: Promise<void> = Promise.resolve();
  private queuedTaskCount = 0;

  get size(): number {
    return this.queuedTaskCount;
  }

  get isIdle(): boolean {
    return this.queuedTaskCount === 0;
  }

  add<T>(task: PromiseTask<T>): Promise<T> {
    this.queuedTaskCount += 1;

    const result = this.tail.then(task, task);
    this.tail = result
      .then(
        () => undefined,
        () => undefined,
      )
      .finally(() => {
        this.queuedTaskCount -= 1;
      });

    return result;
  }

  enqueue<T>(task: PromiseTask<T>): Promise<T> {
    return this.add(task);
  }

  async onIdle(): Promise<void> {
    await this.tail;
  }
}
