import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import Docker from 'dockerode';
import { WorkspaceManagerService } from './workspace-manager.service';

export interface ExecuteJobPayload {
  taskId: string;
  repoUrl?: string;
  imageName: string;
  command: string;
  timeoutMs?: number;
}

export interface ExecutionResult {
  logs: string;
  exitCode: number;
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

    // آماده‌سازی دایرکتوری و کلون احتمالی گیت
    const workspacePath = await this.workspaceManager.prepareWorkspace(
      taskId,
      repoUrl,
    );

    await this.ensureImage(imageName);

    this.logger.log(`[${taskId}] Provisioning sandboxed container on image: ${imageName}`);

    // ماونت دایرکتوری به مسیر /workspace در کانتینر
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
        // نادیده گرفتن خطا اگر کانتینر تمام شده باشد
      }
    }, timeoutMs);

    try {
      await container.start();

      const waitResult: any = await container.wait();
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

      return { logs: logs, exitCode: finalExitCode };
    } catch (error: any) {
      clearTimeout(timeoutHandle);
      const errMessage = error?.message || String(error);
      this.logger.error(`[${taskId}] Runtime execution failure: ${errMessage}`);
      throw new InternalServerErrorException(
        `Docker Execution Failure: ${errMessage}`,
      );
    } finally {
      // ۱. حذف کانتینر
      try {
        await container.remove({ force: true, v: true });
      } catch {
        // نادیده گرفتن خطای حذف
      }

      // ۲. پاکسازی دائمی فایل‌های پروژه از روی هاست
      await this.workspaceManager.cleanWorkspace(taskId, workspacePath);
    }
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