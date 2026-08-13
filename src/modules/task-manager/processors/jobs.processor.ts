import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TaskManagerService } from '../task-manager.service';
import { Logger } from '@nestjs/common';

@Processor('jobs')
export class JobsProcessor {
  private readonly logger = new Logger(JobsProcessor.name);
  constructor(private readonly taskService: TaskManagerService) {}

  async executeJob(job: Job): Promise<any> {
     const { taskId, repoUrl, imageName, command } = job.data;
     
     this.logger.log(`[Worker] Starting job ${taskId}`);

     try {
       return await this.taskService.runJob({ taskId, repoUrl, imageName, command });
     } catch (error: any) {
        this.logger.error(`[Worker] Job failed: ${error.message}`);
        throw error;
     }
  }
}