import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Observable } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { ExecuteTaskDto } from './dto/execute-task.dto';
import { TaskStateService, TaskRecord } from './task-state.service';
import { DockerExecutorService } from './docker-executor.service';
import { CommandSanitizerService } from './command-sanitizer.service';
import { PipelineStep } from './pipeline-step.interface';

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
    const rawSingleCommand = taskDto.command;
    const rawStepsList = taskDto.steps;

    let normalizedSteps: PipelineStep[] = [];
    let summaryCommandText = '';

    // سناریوی اول: کاربر آرایه‌ای از گام‌های پایپ‌لاین فرستاده است
    if (rawStepsList && rawStepsList.length > 0) {
      normalizedSteps = this.commandSanitizer.validatePipelineSteps(rawStepsList);
      summaryCommandText = `Pipeline [${normalizedSteps.length} steps]: ${normalizedSteps.map((s) => s.name).join(' -> ')}`;
    } else if (rawSingleCommand && rawSingleCommand.trim().length > 0) {
      // سناریوی دوم: اجرای تک‌دستور سنتی
      const cleanCommand = this.commandSanitizer.sanitizeAndValidate(rawSingleCommand);
      normalizedSteps = [
        {
          name: 'step-main',
          command: cleanCommand,
          continueOnError: false,
        },
      ];
      summaryCommandText = cleanCommand;
    } else {
      throw new BadRequestException('Either a "command" or at least one entry in "steps" must be specified.');
    }

    const generatedId = uuidv4();
    const targetImage = taskDto.imageName;
    const repositoryUrl = taskDto.repoUrl;
    const notificationCallbackUrl = taskDto.callbackUrl;
    const secretSignatureKey = taskDto.webhookSecret;

    this.logger.log(`Enqueueing job [${generatedId}] with ${normalizedSteps.length} execution step(s)`);

    // ایجاد رکورد اولیه در ذخیره‌ساز حافظه
    this.taskStateService.createInitialRecord(
      generatedId,
      summaryCommandText,
      targetImage,
    );

    // ارسال پی‌لود کامل به صف پردازش BullMQ
    await this.jobsQueue.add(
      'run-isolated-task',
      {
        taskId: generatedId,
        repoUrl: repositoryUrl,
        imageName: targetImage,
        command: summaryCommandText,
        steps: normalizedSteps,
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

    this.logger.log(`Job [${generatedId}] successfully queued for multi-step execution.`);
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