import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { DockerExecutorService, ExecutionResult } from '../docker-executor.service';
import { TaskStateService } from '../task-state.service';
import { WebhookDispatcherService } from '../webhook-dispatcher.service';
import { SecretCryptoService, EncryptedPayload } from '../secret-crypto.service';
import { PipelineStep } from '../pipeline-step.interface';

@Processor('jobs')
export class JobsProcessor extends WorkerHost {
  private readonly logger = new Logger(JobsProcessor.name);

  constructor(
    private readonly dockerExecutor: DockerExecutorService,
    private readonly taskStateService: TaskStateService,
    private readonly webhookDispatcher: WebhookDispatcherService,
    private readonly secretCryptoService: SecretCryptoService,
  ) {
    super();
  }

  async process(job: Job): Promise<ExecutionResult> {
    const taskId = job.data.taskId;
    const repoUrl = job.data.repoUrl;
    const imageName = job.data.imageName;
    const command = job.data.command;
    const steps: PipelineStep[] | undefined = job.data.steps;
    const encryptedEnv: Record<string, EncryptedPayload> | undefined = job.data.encryptedEnv;
    const cacheDirectory: string | undefined = job.data.cacheDirectory;
    const cachePaths: string[] | undefined = job.data.cachePaths;
    const callbackUrl = job.data.callbackUrl;
    const webhookSecret = job.data.webhookSecret;

    const taskStartTime = new Date().toISOString();
    this.taskStateService.markAsRunning(taskId);

    // رمزگشایی متغیرهای محیطی به فرمت کانتینر (KEY=VALUE)
    const runtimeEnvVariables: string[] = [];
    if (encryptedEnv && typeof encryptedEnv === 'object') {
      const envKeys = Object.keys(encryptedEnv);
      for (let i = 0; i < envKeys.length; i++) {
        const key = envKeys[i];
        const payload = encryptedEnv[key];
        try {
          const plainSecretValue = this.secretCryptoService.decryptSecret(payload);
          runtimeEnvVariables.push(`${key}=${plainSecretValue}`);
        } catch (decryptErr: any) {
          const msg = decryptErr?.message || String(decryptErr);
          this.logger.error(`[${taskId}] Secret decryption failure for key "${key}": ${msg}`);
        }
      }
      this.logger.log(`[Worker] Injected ${runtimeEnvVariables.length} secure env variables into container`);
    }

    try {
      let result: ExecutionResult;

      if (steps && steps.length > 0) {
        this.logger.log(`[Worker] Running multi-step pipeline for Task ID: ${taskId} (${steps.length} steps)`);
        result = await this.dockerExecutor.runPipelineJob(
          taskId,
          steps,
          imageName,
          repoUrl,
          runtimeEnvVariables,
          cacheDirectory,
          cachePaths,
        );

        if (result.pipelineReport) {
          this.taskStateService.markPipelineFinished(
            taskId,
            result.pipelineReport,
            result.logs,
            result.resourceUsage,
          );
        } else {
          this.taskStateService.markAsFinished(
            taskId,
            result.exitCode,
            result.logs,
            result.resourceUsage,
          );
        }
      } else {
        this.logger.log(`[Worker] Running single command for Task ID: ${taskId}`);
        result = await this.dockerExecutor.runJob({
          taskId: taskId,
          repoUrl: repoUrl,
          imageName: imageName,
          command: command,
          env: runtimeEnvVariables,
          cacheDirectory: cacheDirectory,
          cachePaths: cachePaths,
        });

        this.taskStateService.markAsFinished(
          taskId,
          result.exitCode,
          result.logs,
          result.resourceUsage,
        );
      }

      this.logger.log(
        `[Worker] Job ID: ${taskId} finished with ExitCode: ${result.exitCode}`,
      );

      if (callbackUrl) {
        const previewText = result.logs ? result.logs.substring(0, 500) : '';
        const taskEndTime = new Date().toISOString();
        const peakMem = result.resourceUsage?.peakMemoryMb;

        await this.webhookDispatcher.dispatchEvent(callbackUrl, webhookSecret, {
          taskId: taskId,
          status: result.exitCode === 0 ? 'COMPLETED' : 'FAILED',
          exitCode: result.exitCode,
          startedAt: taskStartTime,
          finishedAt: taskEndTime,
          logsPreview: previewText,
          peakMemoryMb: peakMem,
        });
      }

      return result;
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      this.logger.error(`[Worker] Job ID: ${taskId} crashed: ${errorMessage}`);

      this.taskStateService.markAsFailed(taskId, errorMessage);

      if (callbackUrl) {
        const failureEndTime = new Date().toISOString();

        await this.webhookDispatcher.dispatchEvent(callbackUrl, webhookSecret, {
          taskId: taskId,
          status: 'FAILED',
          exitCode: 1,
          startedAt: taskStartTime,
          finishedAt: failureEndTime,
          logsPreview: `Execution crashed: ${errorMessage}`,
        });
      }

      throw error;
    }
  }
}