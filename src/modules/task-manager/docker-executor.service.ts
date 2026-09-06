import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import Docker from 'dockerode';

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

  async runJob(payload: ExecuteJobPayload): Promise<ExecutionResult> {
    const { taskId, imageName, command, timeoutMs = 30000 } = payload;
    const containerName = `orchestrator-task-${taskId}`.substring(0, 63);

    await this.ensureImage(imageName);

    this.logger.log(`[${taskId}] Provisioning sandboxed container on image: ${imageName}`);

    const container: Docker.Container = await this.docker.createContainer({
      Image: imageName,
      name: containerName,
      Cmd: ['sh', '-c', command],
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
        ReadonlyRootfs: true,
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
        // Container might already be stopped
      }
    }, timeoutMs);

    try {
      await container.start();

      const waitResult: any = await container.wait();
      clearTimeout(timeoutHandle);

      const exitCode = isTimedOut
        ? 124
        : typeof waitResult?.StatusCode === 'number'
          ? waitResult.StatusCode
          : 1;

      const logBuffer = await container.logs({
        stdout: true,
        stderr: true,
        follow: false,
      });

      const logs = this.demuxDockerLogs(logBuffer);

      return { logs, exitCode };
    } catch (error: any) {
      clearTimeout(timeoutHandle);
      this.logger.error(`[${taskId}] Runtime execution failure: ${error?.message || String(error)}`);
      throw new InternalServerErrorException(
        `Docker Execution Failure: ${error?.message || String(error)}`,
      );
    } finally {
      try {
        await container.remove({ force: true, v: true });
      } catch {
        // Ignore cleanup deletion failure
      }
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