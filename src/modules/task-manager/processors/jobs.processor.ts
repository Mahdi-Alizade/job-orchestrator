import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TaskManagerService } from '../task-manager.service';

@Processor('jobs')
export class JobsProcessor {
  constructor(private readonly taskService: TaskManagerService) {}

  // اینجا به جای دیگه سختگیرانه، از امضای متود استفاده می‌کنیم
  // این روش در تمام ورژن‌های بول‌ام کیو کار می‌کنه
  async handlerJob(job: Job): Promise<any> {
    const { taskId, repoUrl, imageName, command } = job.data;
    
    console.log(`Processing job ${taskId}: Executing command on image ${imageName}`);
    
    return this.taskService.runJob({ taskId, repoUrl, imageName, command });
  }
}