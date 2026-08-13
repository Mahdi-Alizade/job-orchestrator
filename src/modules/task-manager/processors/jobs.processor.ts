import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TaskManagerService } from '../task-manager.service';
import { Logger } from '@nestjs/common';

@Processor('jobs')
export class JobsProcessor {
  private readonly logger = new Logger(JobsProcessor.name);

  constructor(private readonly taskService: TaskManagerService) {}

  /**
   * Generic handler for all jobs in the queue 
   */
  async handler(job: Job): Promise<any> {
    const { taskId, repoUrl, imageName, command } = job.data;
    
    this.logger.log(`[Worker] Processing job ${taskId}: Executing "${command}" on ${imageName}`);

    try {
      return await this.taskService.runJob({ taskId, repoUrl, imageName, command });
    } catch (error: any) {
      // Handle 'unknown' type safely
      this.logger.error(`[Worker] Job failed: ${error.message || String(error)}`);
      throw error;
    }
  }
}