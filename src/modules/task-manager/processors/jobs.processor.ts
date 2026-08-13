import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { TaskManagerService } from '../task-manager.service';

@Processor('jobs')
export class JobsProcessor extends WorkerHost {
  private readonly logger = new Logger(JobsProcessor.name);

  constructor(private readonly taskService: TaskManagerService) {
    super();
  }

  async process(job: Job): Promise<any> {
    const { taskId, repoUrl, imageName, command } = job.data;

    this.logger.log(
      `[Worker] Processing job ${taskId}: Executing "${command}" on ${imageName}`,
    );

    try {
      return await this.taskService.runJob({
        taskId,
        repoUrl,
        imageName,
        command,
      });
    } catch (error: any) {
      this.logger.error(
        `[Worker] Job failed: ${error?.message || String(error)}`,
      );
      throw error;
    }
  }
}