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
    const rawCommand = taskDto.command;
    const validatedCommand = this.commandSanitizer.sanitizeAndValidate(rawCommand);

    const generatedId = uuidv4();
    const targetImage = taskDto.imageName;
    const repositoryUrl = taskDto.repoUrl;
    const notificationCallbackUrl = taskDto.callbackUrl;
    const secretSignatureKey = taskDto.webhookSecret;

    this.logger.log(`Enqueueing task [${generatedId}]: ${validatedCommand.substring(0, 40)}`);

    // ثبت رکورد اولیه در حافظه موقت وضعیت‌ها
    this.taskStateService.createInitialRecord(
      generatedId,
      validatedCommand,
      targetImage,
    );

    // افزودن مشخصات تسک به صف ردیس همراه با اطلاعات وب‌هوک
    await this.jobsQueue.add(
      'run-isolated-task',
      {
        taskId: generatedId,
        repoUrl: repositoryUrl,
        imageName: targetImage,
        command: validatedCommand,
        callbackUrl: notificationCallbackUrl,
        webhookSecret: secretSignatureKey,
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

    this.logger.log(`Job successfully dispatched into BullMQ: ${generatedId}`);
    return generatedId;
  }

  getTaskDetails(taskId: string): TaskRecord | undefined {
    const foundRecord = this.taskStateService.getTaskRecord(taskId);
    return foundRecord;
  }

  listAllTasks(): TaskRecord[] {
    const allRecords = this.taskStateService.getAllTasks();
    return allRecords;
  }

  getTaskLiveLogStream(taskId: string): Observable<{ data: string }> {
    return this.dockerExecutorService.getLiveContainerLogs(taskId);
  }
}