import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Observable } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { ExecuteTaskDto } from './dto/execute-task.dto';
import { TaskStateService, TaskRecord } from './task-state.service';
import { DockerExecutorService } from './docker-executor.service';
import { CommandSanitizerService } from './command-sanitizer.service';
import { SecretCryptoService, EncryptedPayload } from './secret-crypto.service';
import { ArtifactCacheService } from './artifact-cache.service';
import { PipelineStep } from './pipeline-step.interface';

@Injectable()
export class TaskManagerService {
  private readonly logger = new Logger(TaskManagerService.name);

  // فرمت استاندارد نام‌گذاری متغیرهای محیطی سیستم
  private readonly envKeyPattern = /^[A-Z_][A-Z0-9_]*$/i;

  constructor(
    @InjectQueue('jobs') private readonly jobsQueue: Queue,
    private readonly taskStateService: TaskStateService,
    private readonly dockerExecutorService: DockerExecutorService,
    private readonly commandSanitizer: CommandSanitizerService,
    private readonly secretCryptoService: SecretCryptoService,
    private readonly artifactCacheService: ArtifactCacheService,
  ) {}

  async execute(taskDto: ExecuteTaskDto): Promise<string> {
    const rawSingleCommand = taskDto.command;
    const rawStepsList = taskDto.steps;

    let normalizedSteps: PipelineStep[] = [];
    let summaryCommandText = '';

    if (rawStepsList && rawStepsList.length > 0) {
      normalizedSteps = this.commandSanitizer.validatePipelineSteps(rawStepsList);
      summaryCommandText = `Pipeline [${normalizedSteps.length} steps]: ${normalizedSteps.map((s) => s.name).join(' -> ')}`;
    } else if (rawSingleCommand && rawSingleCommand.trim().length > 0) {
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

    // اعتبارسنجی و رمزنگاری متغیرهای محیطی
    const encryptedEnvMap: Record<string, EncryptedPayload> = {};
    const inputEnv = taskDto.env;

    if (inputEnv && typeof inputEnv === 'object') {
      const keys = Object.keys(inputEnv);

      for (let i = 0; i < keys.length; i++) {
        const rawKey = keys[i];
        const trimmedKey = rawKey.trim();

        if (!this.envKeyPattern.test(trimmedKey)) {
          throw new BadRequestException(
            `Invalid environment variable name: "${trimmedKey}". Only alphanumeric and underscore allowed.`,
          );
        }

        const rawValue = String(inputEnv[rawKey] ?? '');
        const cipherPayload = this.secretCryptoService.encryptSecret(rawValue);
        encryptedEnvMap[trimmedKey] = cipherPayload;
      }

      this.logger.log(`Encrypted ${keys.length} environment variable(s) for task execution`);
    }

    // آماده‌سازی دایرکتوری و تنظیمات کش در صورت ارسال توسط کاربر
    let resolvedCacheDirectory: string | undefined;
    let resolvedCachePaths: string[] | undefined;

    if (taskDto.cacheKey || (taskDto.cachePaths && taskDto.cachePaths.length > 0)) {
      const cacheIdentifier = taskDto.cacheKey || taskDto.repoUrl || 'global-cache';
      const safeCacheKey = this.artifactCacheService.generateCacheKey(cacheIdentifier);
      resolvedCacheDirectory = await this.artifactCacheService.ensureCacheDirectory(safeCacheKey);
      resolvedCachePaths = taskDto.cachePaths && taskDto.cachePaths.length > 0
        ? taskDto.cachePaths
        : ['/workspace/node_modules'];

      this.logger.log(`Cache volume prepared for key [${safeCacheKey}] -> ${resolvedCacheDirectory}`);
    }

    const generatedId = uuidv4();
    const targetImage = taskDto.imageName;
    const repositoryUrl = taskDto.repoUrl;
    const notificationCallbackUrl = taskDto.callbackUrl;
    const secretSignatureKey = taskDto.webhookSecret;

    this.logger.log(`Enqueueing job [${generatedId}] with ${normalizedSteps.length} execution step(s)`);

    this.taskStateService.createInitialRecord(
      generatedId,
      summaryCommandText,
      targetImage,
    );

    await this.jobsQueue.add(
      'run-isolated-task',
      {
        taskId: generatedId,
        repoUrl: repositoryUrl,
        imageName: targetImage,
        command: summaryCommandText,
        steps: normalizedSteps,
        encryptedEnv: encryptedEnvMap,
        cacheDirectory: resolvedCacheDirectory,
        cachePaths: resolvedCachePaths,
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

    this.logger.log(`Job [${generatedId}] successfully queued with cache payload.`);
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