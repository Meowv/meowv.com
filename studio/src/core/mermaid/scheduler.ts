/**
 * Mermaid keeps its active configuration in a module singleton.  Serialize
 * initialization and rendering across Studio features so a Markdown preview
 * cannot change the configuration while the Mermaid workbench is rendering.
 */
let mermaidTaskQueue: Promise<void> = Promise.resolve();

export function enqueueMermaidTask<T>(task: () => Promise<T> | T): Promise<T> {
  const next = mermaidTaskQueue.then(task);
  mermaidTaskQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}
