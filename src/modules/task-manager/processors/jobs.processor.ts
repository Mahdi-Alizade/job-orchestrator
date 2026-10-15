import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { DockerExecutorService, ExecutionResult } from '../docker-executor.service';
import { TaskStateService } from '../task-state.service';
import { WebhookDispatcherService } from '../webhook-dispatcher.service';

@Processor('jobs')
export class JobsProcessor extends WorkerHost {
  private readonly logger = new Logger(JobsProcessor.name);

  constructor(
    private readonly dockerExecutor: DockerExecutorService,
    private readonly taskStateService: TaskStateService,
    private readonly webhookDispatcher: WebhookDispatcherService,
  ) {
    super();
  }

  async process(job: Job): Promise<ExecutionResult> {
    const taskId = job.data.taskId;
    const repoUrl = job.data.repoUrl;
    const imageName = job.data.imageName;
    const command = job.data.command;
    const callbackUrl = job.data.callbackUrl;
    const webhookSecret = job.data.webhookSecret;

    this.logger.log(
      `[Worker] Processing Job ID: ${taskId} | Target Image: ${imageName} | Cmd: "${command}"`,
    );

    const taskStartTime = new Date().toISOString();
    this.taskStateService.markAsRunning(taskId);

    try {
      const result = await this.dockerExecutor.runJob({
        taskId: taskId,
        repoUrl: repoUrl,
        imageName: imageName,
        command: command,
      });

      this.logger.log(
        `[Worker] Completed Job ID: ${taskId} with ExitCode: ${result.exitCode}`,
      );

      // ذخیره نتیجه در استور وضعیت وظایف
      this.taskStateService.markAsFinished(
        taskId,
        result.exitCode,
        result.logs,
        result.resourceUsage,
      );

      // اگر کاربر آدرس وب‌هوک داده باشد، نوتیفیکیشن ارسال می‌شود
      if (callbackUrl) {
        const previewText = result.logs ? result.logs.substring(0, 500) : '';
        const taskEndTime = new Date().toISOString();
        const peakMem = result.resourceUsage?.peakMemoryMb;

        await this.webhookDispatcher.dispatchEvent(callbackUrl, webhookSecret, {
          taskId: taskId,
          status: result.exitCode === 0 ? 'COMPLETED' : 'FAILED',
          exitCode: result.exitCode,
          startedAt: taskStartTime,
          finishedAt: taskEndTime,
          logsPreview: previewText,
          peakMemoryMb: peakMem,
        });
      }

      return result;
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      this.logger.error(`[Worker] Failed Job ID: ${taskId} - Reason: ${errorMessage}`);

      this.taskStateService.markAsFailed(taskId, errorMessage);

      // ارسال نوتیفیکیشن خطا در وب‌هوک
      if (callbackUrl) {
        const failureEndTime = new Date().toISOString();

        await this.webhookDispatcher.dispatchEvent(callbackUrl, webhookSecret, {
          taskId: taskId,
          status: 'FAILED',
          exitCode: 1,
          startedAt: taskStartTime,
          finishedAt: failureEndTime,
          logsPreview: `Execution crashed: ${errorMessage}`,
        });
      }

      throw error;
    }
  }
}