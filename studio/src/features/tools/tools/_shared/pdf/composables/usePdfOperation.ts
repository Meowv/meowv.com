import type {
  PdfOperationResult,
  WorkspaceStatus,
} from '@/features/tools/tools/_shared/pdf/core/types';
import { mapPdfError } from '@/features/tools/tools/_shared/pdf/core/shared/errors';

export function usePdfOperation() {
  const status = ref<WorkspaceStatus>('empty');
  const stage = ref('');
  const error = ref('');
  const result = shallowRef<PdfOperationResult | null>(null);
  const controller = shallowRef<AbortController | null>(null);

  async function run(
    operation: (signal: AbortSignal) => Promise<PdfOperationResult>,
    initialStage: string,
  ): Promise<PdfOperationResult | null> {
    controller.value?.abort();
    const currentController = new AbortController();
    controller.value = currentController;
    status.value = 'processing';
    stage.value = initialStage;
    error.value = '';
    result.value = null;

    try {
      const output = await operation(currentController.signal);
      if (currentController.signal.aborted || controller.value !== currentController) {
        return null;
      }
      result.value = output;
      status.value = 'completed';
      stage.value = '处理完成';
      return output;
    } catch (caught) {
      if (controller.value !== currentController) {
        return null;
      }
      const mapped = mapPdfError(caught);
      error.value = mapped.message;
      status.value = mapped.code === 'PROCESS_ABORTED' ? 'ready' : 'failed';
      stage.value = '';
      return null;
    } finally {
      if (controller.value === currentController) {
        controller.value = null;
      }
    }
  }

  function setReady(): void {
    if (status.value !== 'processing') {
      status.value = 'ready';
    }
  }

  function updateStage(value: string): void {
    stage.value = value;
  }

  function cancel(): void {
    controller.value?.abort();
    controller.value = null;
    status.value = 'ready';
    stage.value = '';
    error.value = '处理已取消，临时资源已经释放。';
  }

  function reset(): void {
    controller.value?.abort();
    controller.value = null;
    status.value = 'empty';
    stage.value = '';
    error.value = '';
    result.value = null;
  }

  onScopeDispose(() => {
    controller.value?.abort();
    controller.value = null;
  });

  return {
    status,
    stage: readonly(stage),
    error: readonly(error),
    result: readonly(result),
    run,
    setReady,
    updateStage,
    cancel,
    reset,
  };
}
