export type StudioErrorCode =
  | 'cancelled'
  | 'unsupported-browser'
  | 'unsupported-file'
  | 'permission-denied'
  | 'processing-failed';

export class StudioError extends Error {
  constructor(
    readonly code: StudioErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'StudioError';
  }
}

export function readableError(error: unknown): string {
  if (error instanceof StudioError) return error.message;
  if (error instanceof DOMException && error.name === 'AbortError') return '已取消本次操作。';
  if (error instanceof Error) return error.message;
  return '操作未完成，请重试。';
}
