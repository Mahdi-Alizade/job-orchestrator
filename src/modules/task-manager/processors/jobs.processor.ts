import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { DockerExecutorService, ExecutionResult } from '../docker-executor.service';
import { TaskStateService } from '../task-state.service';

@Processor('jobs')
export class JobsProcessor extends WorkerHost {
  private readonly logger = new Logger(JobsProcessor.name);

  constructor(
    private readonly dockerExecutor: DockerExecutorService,
    private readonly taskStateService: TaskStateService,
  ) {
    super();
  }

  async process(job: Job): Promise<ExecutionResult> {
    const taskId = job.data.taskId;
    const repoUrl = job.data.repoUrl;
    const imageName = job.data.imageName;
    const command = job.data.command;

    this.logger.log(
      `[Worker] Processing Job ID: ${taskId} | Target Image: ${imageName} | Cmd: "${command}"`,
    );

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

      this.taskStateService.markAsFinished(
        taskId,
        result.exitCode,
        result.logs,
        result.resourceUsage,
      );

      return result;
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      this.logger.error(`[Worker] Failed Job ID: ${taskId} - Reason: ${errorMessage}`);

      this.taskStateService.markAsFailed(taskId, errorMessage);
      throw error;
    }
  }
}