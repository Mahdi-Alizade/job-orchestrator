import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import Docker from 'dockerode';
import { Observable } from 'rxjs';
import { WorkspaceManagerService } from './workspace-manager.service';
import {
  PipelineStep,
  StepExecutionResult,
  PipelineExecutionReport,
} from './pipeline-step.interface';

export interface ExecuteJobPayload {
  taskId: string;
  repoUrl?: string;
  imageName: string;
  command: string;
  steps?: PipelineStep[];
  env?: string[];
  timeoutMs?: number;
}

export interface ResourceUsageStats {
  peakMemoryMb: number;
  cpuPercent: number;
}

export interface ExecutionResult {
  logs: string;
  exitCode: number;
  resourceUsage?: ResourceUsageStats;
  pipelineReport?: PipelineExecutionReport;
}

@Injectable()
export class DockerExecutorService {
  private readonly logger = new Logger(DockerExecutorService.name);

  private readonly docker: Docker =
    process.platform === 'win32'
      ? new Docker({ socketPath: '//./pipe/docker_engine' })
      : new Docker({ socketPath: '/var/run/docker.sock' });

  constructor(
    private readonly workspaceManager: WorkspaceManagerService,
  ) {}

  async runJob(payload: ExecuteJobPayload): Promise<ExecutionResult> {
    const taskId = payload.taskId;
    const imageName = payload.imageName;
    const command = payload.command;
    const repoUrl = payload.repoUrl;
    const envVariables = payload.env || [];
    const timeoutMs = payload.timeoutMs || 30000;

    const containerName = `orchestrator-task-${taskId}`.substring(0, 63);

    const workspacePath = await this.workspaceManager.prepareWorkspace(
      taskId,
      repoUrl,
    );

    await this.ensureImage(imageName);

    this.logger.log(`[${taskId}] Provisioning sandboxed container on image: ${imageName}`);

    const bindsConfig: string[] = [
      `${workspacePath}:/workspace:rw`,
    ];

    const container: Docker.Container = await this.docker.createContainer({
      Image: imageName,
      name: containerName,
      Cmd: ['sh', '-c', command],
      WorkingDir: '/workspace',
      Env: envVariables,
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
      HostConfig: {
        AutoRemove: false,
        NetworkMode: 'none',
        Memory: 512 * 1024 * 1024,
        NanoCpus: 1000000000,
        PidsLimit: 50,
        CapDrop: ['ALL'],
        Binds: bindsConfig,
        Tmpfs: {
          '/tmp': 'rw,noexec,nosuid,size=64m',
        },
      },
    });

    let isTimedOut = false;
    const timeoutHandle = setTimeout(async () => {
      isTimedOut = true;
      try {
        this.logger.warn(`[${taskId}] Task exceeded execution limit (${timeoutMs}ms). Killing container.`);
        await container.kill();
      } catch {
        // نادیده گرفتن خطا اگر کانتینر قبلاً متوقف شده باشد
      }
    }, timeoutMs);

    let maxMemoryBytes = 0;
    let monitoringActive = true;

    const statsSampler = async () => {
      while (monitoringActive) {
        try {
          const stats: any = await container.stats({ stream: false });
          const currentUsage = stats?.memory_stats?.usage;
          if (typeof currentUsage === 'number' && currentUsage > maxMemoryBytes) {
            maxMemoryBytes = currentUsage;
          }
        } catch {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    };

    try {
      await container.start();
      statsSampler();

      const waitResult: any = await container.wait();
      monitoringActive = false;
      clearTimeout(timeoutHandle);

      let finalExitCode = 1;
      if (isTimedOut) {
        finalExitCode = 124;
      } else if (typeof waitResult?.StatusCode === 'number') {
        finalExitCode = waitResult.StatusCode;
      }

      const logBuffer = await container.logs({
        stdout: true,
        stderr: true,
        follow: false,
      });

      const logs = this.demuxDockerLogs(logBuffer);
      const peakMb = Math.round((maxMemoryBytes / (1024 * 1024)) * 100) / 100;

      return {
        logs: logs,
        exitCode: finalExitCode,
        resourceUsage: {
          peakMemoryMb: peakMb,
          cpuPercent: 0,
        },
      };
    } catch (error: any) {
      monitoringActive = false;
      clearTimeout(timeoutHandle);
      const errMessage = error?.message || String(error);
      this.logger.error(`[${taskId}] Runtime execution failure: ${errMessage}`);
      throw new InternalServerErrorException(
        `Docker Execution Failure: ${errMessage}`,
      );
    } finally {
      monitoringActive = false;
      try {
        await container.remove({ force: true, v: true });
      } catch {
        // نادیده گرفتن خطای حذف کانتینر
      }

      await this.workspaceManager.cleanWorkspace(taskId, workspacePath);
    }
  }

  async runPipelineJob(
    taskId: string,
    steps: PipelineStep[],
    imageName: string,
    repoUrl?: string,
    envVariables: string[] = [],
    timeoutMs: number = 60000,
  ): Promise<ExecutionResult> {
    const containerName = `orchestrator-task-${taskId}`.substring(0, 63);

    const workspacePath = await this.workspaceManager.prepareWorkspace(
      taskId,
      repoUrl,
    );

    await this.ensureImage(imageName);

    this.logger.log(`[${taskId}] Provisioning long-lived sandbox container for multi-step pipeline`);

    const bindsConfig: string[] = [
      `${workspacePath}:/workspace:rw`,
    ];

    const container = await this.docker.createContainer({
      Image: imageName,
      name: containerName,
      Cmd: ['tail', '-f', '/dev/null'],
      WorkingDir: '/workspace',
      Env: envVariables,
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
      HostConfig: {
        AutoRemove: false,
        NetworkMode: 'none',
        Memory: 512 * 1024 * 1024,
        NanoCpus: 1000000000,
        PidsLimit: 50,
        CapDrop: ['ALL'],
        Binds: bindsConfig,
        Tmpfs: {
          '/tmp': 'rw,noexec,nosuid,size=64m',
        },
      },
    });

    let maxMemoryBytes = 0;
    let monitoringActive = true;

    const statsSampler = async () => {
      while (monitoringActive) {
        try {
          const stats: any = await container.stats({ stream: false });
          const currentUsage = stats?.memory_stats?.usage;
          if (typeof currentUsage === 'number' && currentUsage > maxMemoryBytes) {
            maxMemoryBytes = currentUsage;
          }
        } catch {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    };

    const stepResults: StepExecutionResult[] = [];
    let combinedLogs = '';
    let pipelineHalted = false;
    const pipelineStartTime = Date.now();

    try {
      await container.start();
      statsSampler();

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const stepName = step.name;
        const stepCommand = step.command;
        const continueOnError = Boolean(step.continueOnError);

        if (pipelineHalted) {
          stepResults.push({
            stepName: stepName,
            command: stepCommand,
            exitCode: -1,
            logs: '[SKIPPED due to previous step failure]',
            durationMs: 0,
            status: 'SKIPPED',
          });
          continue;
        }

        this.logger.log(`[${taskId}] Running Step [${i + 1}/${steps.length}]: "${stepName}"`);

        const stepHeader = `\n--- [STEP: ${stepName}] ---\n`;
        combinedLogs += stepHeader;

        const stepStart = Date.now();
        const execInstance = await container.exec({
          Cmd: ['sh', '-c', stepCommand],
          Env: envVariables,
          AttachStdout: true,
          AttachStderr: true,
          WorkingDir: '/workspace',
        });

        const execStream = await execInstance.start({ Detach: false });
        const stepLogChunks: Buffer[] = [];

        await new Promise<void>((resolve, reject) => {
          execStream.on('data', (chunk: Buffer) => {
            stepLogChunks.push(chunk);
          });
          execStream.on('end', () => resolve());
          execStream.on('error', (err) => reject(err));
        });

        const stepDuration = Date.now() - stepStart;
        const inspectData = await execInstance.inspect();
        const stepExitCode = typeof inspectData.ExitCode === 'number' ? inspectData.ExitCode : 1;

        const rawStepBuffer = Buffer.concat(stepLogChunks);
        const stepOutputLogs = this.demuxDockerLogs(rawStepBuffer);

        combinedLogs += stepOutputLogs ? `${stepOutputLogs}\n` : '';

        const stepStatus = stepExitCode === 0 ? 'PASSED' : 'FAILED';

        stepResults.push({
          stepName: stepName,
          command: stepCommand,
          exitCode: stepExitCode,
          logs: stepOutputLogs,
          durationMs: stepDuration,
          status: stepStatus,
        });

        if (stepExitCode !== 0 && !continueOnError) {
          this.logger.warn(`[${taskId}] Step "${stepName}" failed with code ${stepExitCode}. Aborting rest of pipeline.`);
          pipelineHalted = true;
        }
      }

      monitoringActive = false;
      const totalDuration = Date.now() - pipelineStartTime;
      const overallSuccess = !pipelineHalted && stepResults.every((s) => s.status === 'PASSED' || (s.status === 'FAILED' && steps.find((orig) => orig.name === s.stepName)?.continueOnError));

      const peakMb = Math.round((maxMemoryBytes / (1024 * 1024)) * 100) / 100;

      const report: PipelineExecutionReport = {
        overallSuccess: overallSuccess,
        totalDurationMs: totalDuration,
        steps: stepResults,
      };

      return {
        logs: combinedLogs.trim(),
        exitCode: overallSuccess ? 0 : 1,
        resourceUsage: {
          peakMemoryMb: peakMb,
          cpuPercent: 0,
        },
        pipelineReport: report,
      };
    } catch (error: any) {
      monitoringActive = false;
      const errorText = error?.message || String(error);
      this.logger.error(`[${taskId}] Pipeline execution failed: ${errorText}`);
      throw new InternalServerErrorException(`Pipeline Runtime Error: ${errorText}`);
    } finally {
      monitoringActive = false;
      try {
        await container.kill();
      } catch {
        // نادیده گرفتن خطا در صورت خاتمه کانتینر
      }

      try {
        await container.remove({ force: true, v: true });
      } catch {
        // نادیده گرفتن خطای حذف کانتینر
      }

      await this.workspaceManager.cleanWorkspace(taskId, workspacePath);
    }
  }

  getLiveContainerLogs(taskId: string): Observable<{ data: string }> {
    const containerName = `orchestrator-task-${taskId}`.substring(0, 63);

    return new Observable((subscriber) => {
      const container = this.docker.getContainer(containerName);

      container.logs(
        {
          follow: true,
          stdout: true,
          stderr: true,
        },
        (err: Error | null, stream?: NodeJS.ReadableStream) => {
          if (err || !stream) {
            subscriber.error(err || new Error('Unable to attach to container logs'));
            return;
          }

          stream.on('data', (chunk: Buffer) => {
            const rawChunkText = this.demuxDockerLogs(chunk);
            if (rawChunkText && rawChunkText.length > 0) {
              subscriber.next({ data: rawChunkText });
            }
          });

          stream.on('end', () => {
            subscriber.complete();
          });

          stream.on('error', (streamErr) => {
            subscriber.error(streamErr);
          });
        },
      );
    });
  }

  private async ensureImage(imageName: string): Promise<void> {
    try {
      await this.docker.getImage(imageName).inspect();
      return;
    } catch {
      this.logger.log(`Image not cached locally. Pulling: ${imageName}`);
    }

    await new Promise<void>((resolve, reject) => {
      this.docker.pull(
        imageName,
        (err: Error | null, stream: NodeJS.ReadableStream) => {
          if (err) {
            reject(err);
            return;
          }

          this.docker.modem.followProgress(stream, (pullErr: Error | null) => {
            if (pullErr) {
              reject(pullErr);
            } else {
              resolve();
            }
          });
        },
      );
    });
  }

  private demuxDockerLogs(buffer: Buffer | string): string {
    if (typeof buffer === 'string') {
      return buffer;
    }

    if (!Buffer.isBuffer(buffer)) {
      return String(buffer);
    }

    let offset = 0;
    let output = '';

    while (offset + 8 <= buffer.length) {
      const size = buffer.readUInt32BE(offset + 4);
      const start = offset + 8;
      const end = start + size;

      if (end > buffer.length) {
        break;
      }

      output += buffer.slice(start, end).toString('utf8');
      offset = end;
    }

    if (!output) {
      output = buffer.toString('utf8');
    }

    return output.trim();
  }
}