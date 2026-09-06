import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { ExecuteTaskDto } from './dto/execute-task.dto';

@Injectable()
export class TaskManagerService {
  private readonly logger = new Logger(TaskManagerService.name);

  constructor(@InjectQueue('jobs') private readonly jobsQueue: Queue) {}

  async execute(taskDto: ExecuteTaskDto): Promise<string> {
    const taskId = uuidv4();

    this.logger.log(`Enqueueing task [${taskId}]: ${taskDto.command.substring(0, 40)}`);

    await this.jobsQueue.add(
      'run-isolated-task',
      {
        taskId,
        repoUrl: taskDto.repoUrl,
        imageName: taskDto.imageName,
        command: taskDto.command,
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );

    this.logger.log(`Job successfully queued: ${taskId}`);
    return taskId;
  }
}