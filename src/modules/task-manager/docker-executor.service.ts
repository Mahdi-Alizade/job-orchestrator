import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import Docker from 'dockerode';
import { Observable } from 'rxjs';
import { WorkspaceManagerService } from './workspace-manager.service';

export interface ExecuteJobPayload {
  taskId: string;
  repoUrl?: string;
  imageName: string;
  command: string;
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
        // نادیده گرفتن خطا اگر کانتینر بسته شده باشد
      }
    }, timeoutMs);

    // پایش سبک حافظه در پس‌زمینه
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
          // در صورت توقف کانتینر نمونه‌برداری متوقف می‌شود
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    };

    try {
      await container.start();

      // شروع ثبت لاگ مصرف در بک‌گراند
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