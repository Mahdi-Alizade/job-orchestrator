import { Injectable, Logger } from '@nestjs/common';

export type TaskStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'TIMED_OUT';

export interface TaskRecord {
  taskId: string;
  command: string;
  imageName: string;
  status: TaskStatus;
  exitCode: number | null;
  logs: string;
  startedAt: Date;
  finishedAt: Date | null;
  errorMessage?: string;
}

@Injectable()
export class TaskStateService {
  private readonly logger = new Logger(TaskStateService.name);

  // کش محلی حافظه برای نگه‌داری سریع تاریخچه جاب‌ها
  private readonly taskStore = new Map<string, TaskRecord>();

  createInitialRecord(taskId: string, command: string, imageName: string): void {
    const newRecord: TaskRecord = {
      taskId: taskId,
      command: command,
      imageName: imageName,
      status: 'PENDING',
      exitCode: null,
      logs: '',
      startedAt: new Date(),
      finishedAt: null,
    };

    this.taskStore.set(taskId, newRecord);
    this.logger.log(`Initialized tracking state for task [${taskId}]`);
  }

  markAsRunning(taskId: string): void {
    const record = this.taskStore.get(taskId);
    if (!record) {
      return;
    }

    record.status = 'RUNNING';
    this.taskStore.set(taskId, record);
  }

  markAsFinished(taskId: string, exitCode: number, logs: string): void {
    const record = this.taskStore.get(taskId);
    if (!record) {
      return;
    }

    record.exitCode = exitCode;
    record.logs = logs;
    record.finishedAt = new Date();

    if (exitCode === 0) {
      record.status = 'COMPLETED';
    } else if (exitCode === 124) {
      record.status = 'TIMED_OUT';
    } else {
      record.status = 'FAILED';
    }

    this.taskStore.set(taskId, record);
    this.logger.log(`Task [${taskId}] marked as ${record.status}`);
  }

  markAsFailed(taskId: string, errorMsg: string): void {
    const record = this.taskStore.get(taskId);
    if (!record) {
      return;
    }

    record.status = 'FAILED';
    record.finishedAt = new Date();
    record.errorMessage = errorMsg;
    this.taskStore.set(taskId, record);
  }

  getTaskRecord(taskId: string): TaskRecord | undefined {
    return this.taskStore.get(taskId);
  }

  getAllTasks(): TaskRecord[] {
    const items = Array.from(this.taskStore.values());
    return items;
  }
}