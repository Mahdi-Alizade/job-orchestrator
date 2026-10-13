import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { ExecuteTaskDto } from './dto/execute-task.dto';
import { TaskStateService, TaskRecord } from './task-state.service';

@Injectable()
export class TaskManagerService {
  private readonly logger = new Logger(TaskManagerService.name);

  constructor(
    @InjectQueue('jobs') private readonly jobsQueue: Queue,
    private readonly taskStateService: TaskStateService,
  ) {}

  async execute(taskDto: ExecuteTaskDto): Promise<string> {
    const generatedId = uuidv4();

    this.logger.log(`Enqueueing task [${generatedId}]: ${taskDto.command.substring(0, 40)}`);

    // ثبت اولیه در استور وضعیت
    this.taskStateService.createInitialRecord(
      generatedId,
      taskDto.command,
      taskDto.imageName,
    );

    await this.jobsQueue.add(
      'run-isolated-task',
      {
        taskId: generatedId,
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

    this.logger.log(`Job successfully queued: ${generatedId}`);
    return generatedId;
  }

  getTaskDetails(taskId: string): TaskRecord | undefined {
    const record = this.taskStateService.getTaskRecord(taskId);
    return record;
  }

  listAllTasks(): TaskRecord[] {
    const records = this.taskStateService.getAllTasks();
    return records;
  }
}