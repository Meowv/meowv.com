import { workbookRepository } from "../db/repositories/workbook.repository";
import { AppError } from "../models/app-error";
import type { WorkbookRecord } from "../models/workbook";
import { PromiseQueue } from "../utils/promise-queue";
import { revisionService } from "./revision.service";

export const AUTO_SAVE_DELAY = 1_500;
export const AUTO_SAVE_MAX_WAIT = 5_000;

export type AutoSaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export interface AutoSaveState {
  status: AutoSaveStatus;
  workbookId?: string;
  savedAt?: number;
  error?: AppError;
}

export type AutoSaveListener = (state: AutoSaveState) => void;

export interface AutoSaveServiceOptions {
  delay?: number;
  maxWait?: number;
  onRevisionError?: (error: AppError) => void;
}

interface SaveWaiter {
  resolve: () => void;
  reject: (error: AppError) => void;
}

interface PendingSave {
  record: WorkbookRecord;
  waiters: SaveWaiter[];
}

export class AutoSaveService {
  private readonly queue = new PromiseQueue();
  private readonly listeners = new Set<AutoSaveListener>();
  private readonly activeSaves = new Set<Promise<void>>();
  private delay: number;
  private maxWait: number;
  private readonly onRevisionError?: (error: AppError) => void;
  private pendingSave?: PendingSave;
  private debounceTimer?: ReturnType<typeof setTimeout>;
  private maxWaitTimer?: ReturnType<typeof setTimeout>;
  private lastSaveError?: AppError;
  private disposed = false;
  private state: AutoSaveState = { status: "idle" };

  constructor(options: AutoSaveServiceOptions = {}) {
    this.delay = Math.max(0, options.delay ?? AUTO_SAVE_DELAY);
    this.maxWait = Math.max(this.delay, options.maxWait ?? AUTO_SAVE_MAX_WAIT);
    this.onRevisionError = options.onRevisionError;
  }

  getState(): Readonly<AutoSaveState> {
    return this.state;
  }

  configure(options: Pick<AutoSaveServiceOptions, "delay" | "maxWait">): void {
    if (options.delay !== undefined) {
      this.delay = Math.max(0, options.delay);
    }
    if (options.maxWait !== undefined) {
      this.maxWait = Math.max(this.delay, options.maxWait);
    } else {
      this.maxWait = Math.max(this.delay, this.maxWait);
    }
  }

  subscribe(listener: AutoSaveListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  schedule(record: WorkbookRecord): Promise<void> {
    if (this.disposed) {
      return Promise.reject(
        new AppError({
          code: "OPERATION_CANCELLED",
          message: "自动保存服务已停止。",
        }),
      );
    }

    if (this.pendingSave && this.pendingSave.record.id !== record.id) {
      this.startPendingSave();
    }

    const promise = new Promise<void>((resolve, reject) => {
      const waiter: SaveWaiter = { resolve, reject };
      if (this.pendingSave) {
        this.pendingSave.record = record;
        this.pendingSave.waiters.push(waiter);
      } else {
        this.pendingSave = {
          record,
          waiters: [waiter],
        };
      }
    });

    this.emit({
      status: "dirty",
      workbookId: record.id,
    });
    this.restartDebounceTimer();
    if (this.maxWaitTimer === undefined) {
      this.maxWaitTimer = setTimeout(() => {
        this.startPendingSave();
      }, this.maxWait);
    }

    return promise;
  }

  scheduleSave(record: WorkbookRecord): Promise<void> {
    return this.schedule(record);
  }

  async saveNow(record: WorkbookRecord): Promise<void> {
    const scheduledSave = this.schedule(record);
    await this.flush();
    await scheduledSave;
  }

  async flush(): Promise<void> {
    try {
      while (this.pendingSave || this.activeSaves.size > 0) {
        if (this.pendingSave) {
          this.startPendingSave();
        }

        const activeSaves = [...this.activeSaves];
        if (activeSaves.length > 0) {
          await Promise.all(activeSaves);
        } else {
          await this.queue.onIdle();
        }
      }
    } catch (error) {
      const appError = AppError.from(error, "SAVE_FAILED", "自动保存失败。");
      this.lastSaveError = undefined;
      throw appError;
    }

    if (this.lastSaveError) {
      const error = this.lastSaveError;
      this.lastSaveError = undefined;
      throw error;
    }
  }

  cancelPending(): void {
    this.clearTimers();
    const pending = this.pendingSave;
    this.pendingSave = undefined;
    if (!pending) {
      return;
    }

    const error = new AppError({
      code: "OPERATION_CANCELLED",
      message: "尚未执行的自动保存已取消。",
    });
    pending.waiters.forEach((waiter) => waiter.reject(error));
    this.emit({ status: "idle" });
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.cancelPending();
    this.listeners.clear();
  }

  private restartDebounceTimer(): void {
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.startPendingSave();
    }, this.delay);
  }

  private startPendingSave(): void {
    const pending = this.pendingSave;
    if (!pending) {
      this.clearTimers();
      return;
    }

    this.pendingSave = undefined;
    this.clearTimers();
    const savePromise = this.queue.add(async () => {
      this.emit({
        status: "saving",
        workbookId: pending.record.id,
      });

      try {
        const savedAt = Date.now();
        await workbookRepository.update(pending.record.id, {
          snapshot: pending.record.snapshot,
          sheetCount: pending.record.sheetCount,
          schemaVersion: pending.record.schemaVersion,
          updatedAt: savedAt,
          hasLocalChanges: true,
        });
        await this.tryCreateAutomaticRevision(pending.record.id);
        this.lastSaveError = undefined;
        pending.waiters.forEach((waiter) => waiter.resolve());
        this.emit(
          this.pendingSave
            ? {
                status: "dirty",
                workbookId: this.pendingSave.record.id,
              }
            : {
                status: "saved",
                workbookId: pending.record.id,
                savedAt,
              },
        );
      } catch (error) {
        const appError = AppError.from(error, "SAVE_FAILED", "自动保存失败。");
        this.lastSaveError = appError;
        pending.waiters.forEach((waiter) => waiter.reject(appError));
        this.emit({
          status: "error",
          workbookId: pending.record.id,
          error: appError,
        });
        throw appError;
      }
    });

    this.activeSaves.add(savePromise);
    void savePromise.then(
      () => {
        this.activeSaves.delete(savePromise);
      },
      () => {
        this.activeSaves.delete(savePromise);
      },
    );
  }

  private async tryCreateAutomaticRevision(workbookId: string): Promise<void> {
    try {
      await revisionService.createAutoIfDue(workbookId);
    } catch (error) {
      this.onRevisionError?.(AppError.from(error, "SAVE_FAILED", "自动版本创建失败。"));
    }
  }

  private clearTimers(): void {
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
    if (this.maxWaitTimer !== undefined) {
      clearTimeout(this.maxWaitTimer);
      this.maxWaitTimer = undefined;
    }
  }

  private emit(state: AutoSaveState): void {
    this.state = state;
    this.listeners.forEach((listener) => listener(state));
  }
}

export const autosaveService = new AutoSaveService();
