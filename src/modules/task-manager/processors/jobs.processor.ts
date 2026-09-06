import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { DockerExecutorService, ExecutionResult } from '../docker-executor.service';

@Processor('jobs')
export class JobsProcessor extends WorkerHost {
  private readonly logger = new Logger(JobsProcessor.name);

  constructor(private readonly dockerExecutor: DockerExecutorService) {
    super();
  }

  async process(job: Job): Promise<ExecutionResult> {
    const { taskId, repoUrl, imageName, command } = job.data;

    this.logger.log(
      `[Worker] Processing Job ID: ${taskId} | Target Image: ${imageName} | Cmd: "${command}"`,
    );

    try {
      const result = await this.dockerExecutor.runJob({
        taskId,
        repoUrl,
        imageName,
        command,
      });

      this.logger.log(
        `[Worker] Completed Job ID: ${taskId} with ExitCode: ${result.exitCode}`,
      );

      return result;
    } catch (error: any) {
      this.logger.error(
        `[Worker] Failed Job ID: ${taskId} - Reason: ${error?.message || String(error)}`,
      );
      throw error;
    }
  }
}