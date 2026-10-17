import { Injectable, Logger } from '@nestjs/common';
import { ResourceUsageStats } from './docker-executor.service';
import { PipelineExecutionReport } from './pipeline-step.interface';

export type TaskStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'TIMED_OUT'
  | 'CANCELLED';

export interface TaskRecord {
  taskId: string;
  command: string;
  imageName: string;
  status: TaskStatus;
  exitCode: number | null;
  logs: string;
  startedAt: Date;
  finishedAt: Date | null;
  resourceUsage?: ResourceUsageStats;
  pipelineReport?: PipelineExecutionReport;
  errorMessage?: string;
}

@Injectable()
export class TaskStateService {
  private readonly logger = new Logger(TaskStateService.name);

  private readonly taskStore = new Map<string, TaskRecord>();

  createInitialRecord(taskId: string, command: string, imageName: string): void {
    const initialTaskRecord: TaskRecord = {
      taskId: taskId,
      command: command,
      imageName: imageName,
      status: 'PENDING',
      exitCode: null,
      logs: '',
      startedAt: new Date(),
      finishedAt: null,
    };

    this.taskStore.set(taskId, initialTaskRecord);
    this.logger.log(`Initialized tracking state for task [${taskId}]`);
  }

  markAsRunning(taskId: string): void {
    const currentRecord = this.taskStore.get(taskId);
    if (!currentRecord) {
      return;
    }

    currentRecord.status = 'RUNNING';
    this.taskStore.set(taskId, currentRecord);
  }

  markAsFinished(
    taskId: string,
    exitCode: number,
    logs: string,
    resourceUsage?: ResourceUsageStats,
  ): void {
    const currentRecord = this.taskStore.get(taskId);
    if (!currentRecord) {
      return;
    }

    currentRecord.exitCode = exitCode;
    currentRecord.logs = logs;
    currentRecord.finishedAt = new Date();
    currentRecord.resourceUsage = resourceUsage;

    if (exitCode === 0) {
      currentRecord.status = 'COMPLETED';
    } else if (exitCode === 124) {
      currentRecord.status = 'TIMED_OUT';
    } else {
      currentRecord.status = 'FAILED';
    }

    this.taskStore.set(taskId, currentRecord);
    this.logger.log(`Task [${taskId}] marked as ${currentRecord.status}`);
  }

  markPipelineFinished(
    taskId: string,
    pipelineReport: PipelineExecutionReport,
    combinedLogs: string,
    resourceUsage?: ResourceUsageStats,
  ): void {
    const currentRecord = this.taskStore.get(taskId);
    if (!currentRecord) {
      return;
    }

    const wasSuccessful = pipelineReport.overallSuccess;
    const finalStatusCode = wasSuccessful ? 0 : 1;

    currentRecord.exitCode = finalStatusCode;
    currentRecord.logs = combinedLogs;
    currentRecord.finishedAt = new Date();
    currentRecord.resourceUsage = resourceUsage;
    currentRecord.pipelineReport = pipelineReport;
    currentRecord.status = wasSuccessful ? 'COMPLETED' : 'FAILED';

    this.taskStore.set(taskId, currentRecord);
    this.logger.log(
      `Pipeline [${taskId}] marked as ${currentRecord.status} (Total steps: ${pipelineReport.steps.length})`,
    );
  }

  markAsFailed(taskId: string, errorMsg: string): void {
    const currentRecord = this.taskStore.get(taskId);
    if (!currentRecord) {
      return;
    }

    currentRecord.status = 'FAILED';
    currentRecord.finishedAt = new Date();
    currentRecord.errorMessage = errorMsg;
    this.taskStore.set(taskId, currentRecord);
  }

  markAsCancelled(taskId: string, reason: string = 'Task manually aborted by user'): void {
    const currentRecord = this.taskStore.get(taskId);
    if (!currentRecord) {
      return;
    }

    currentRecord.status = 'CANCELLED';
    currentRecord.finishedAt = new Date();
    currentRecord.exitCode = 137; // SIGKILL standard Linux exit code
    currentRecord.errorMessage = reason;
    this.taskStore.set(taskId, currentRecord);
    this.logger.warn(`Task [${taskId}] marked as CANCELLED`);
  }

  getTaskRecord(taskId: string): TaskRecord | undefined {
    return this.taskStore.get(taskId);
  }

  getAllTasks(): TaskRecord[] {
    return Array.from(this.taskStore.values());
  }
}