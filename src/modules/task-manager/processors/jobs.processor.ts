import { Process, Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TaskManagerService } from '../task-manager.service';
import { Logger } from '@nestjs/common';

@Processor('jobs')
export class JobsProcessor {
  private readonly logger = new Logger(JobsProcessor.name);

  constructor(private readonly taskService: TaskManagerService) {}

  @Process('run-isolated-task')
  async handleRunTask(job: Job): Promise<any> {
    const { taskId, repoUrl, imageName, command } = job.data;
    
    this.logger.log(`Processing job ${taskId}: Executing command on image ${imageName}`);
    
    // Delegate the heavy lifting (Docker spawning) to the service
    return this.taskService.runJob({ taskId, repoUrl, imageName, command });
  }
}