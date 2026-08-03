export class TaskController {
  #controller: AbortController | null = null;

  start(): AbortSignal {
    this.cancel('任务已被新操作替换');
    this.#controller = new AbortController();
    return this.#controller.signal;
  }

  cancel(reason = '用户已取消任务'): void {
    this.#controller?.abort(reason);
    this.#controller = null;
  }

  get active(): boolean {
    return this.#controller !== null && !this.#controller.signal.aborted;
  }
}
