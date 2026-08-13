import { Processor, Process } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TaskManagerService } from '../task-manager.service';
import { Logger } from '@nestjs/common';

@Processor('jobs')
export class JobsProcessor {
  private readonly logger = new Logger(JobsProcessor.name);

  constructor(private readonly taskService: TaskManagerService) {}

  @Process('run-isolated-task')
  async executeJob(job: Job): Promise<any> {
    const { taskId, repoUrl, imageName, command } = job.data;

    this.logger.log(`Processing job ${taskId}: Executing "${command}" on ${imageName}`);

    try {
      return await this.taskService.runJob({ taskId, repoUrl, imageName, command });
    } catch (error) {
      this.logger.error(`Failed to process job ${taskId}: ${error.message}`);
      throw error;
    }
  }
}