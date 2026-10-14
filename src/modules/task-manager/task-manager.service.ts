import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Observable } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { ExecuteTaskDto } from './dto/execute-task.dto';
import { TaskStateService, TaskRecord } from './task-state.service';
import { DockerExecutorService } from './docker-executor.service';
import { CommandSanitizerService } from './command-sanitizer.service';

@Injectable()
export class TaskManagerService {
  private readonly logger = new Logger(TaskManagerService.name);

  constructor(
    @InjectQueue('jobs') private readonly jobsQueue: Queue,
    private readonly taskStateService: TaskStateService,
    private readonly dockerExecutorService: DockerExecutorService,
    private readonly commandSanitizer: CommandSanitizerService,
  ) {}

  async execute(taskDto: ExecuteTaskDto): Promise<string> {
    // اعتبارسنجی و پاکسازی دستور ورودی
    const validatedCommand = this.commandSanitizer.sanitizeAndValidate(
      taskDto.command,
    );

    const generatedId = uuidv4();

    this.logger.log(`Enqueueing task [${generatedId}]: ${validatedCommand.substring(0, 40)}`);

    this.taskStateService.createInitialRecord(
      generatedId,
      validatedCommand,
      taskDto.imageName,
    );

    await this.jobsQueue.add(
      'run-isolated-task',
      {
        taskId: generatedId,
        repoUrl: taskDto.repoUrl,
        imageName: taskDto.imageName,
        command: validatedCommand,
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

  getTaskLiveLogStream(taskId: string): Observable<{ data: string }> {
    return this.dockerExecutorService.getLiveContainerLogs(taskId);
  }
}