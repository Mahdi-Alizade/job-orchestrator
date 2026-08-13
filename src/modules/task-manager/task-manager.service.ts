import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import Docker from 'dockerode';
import { v4 as uuidv4 } from 'uuid';
import { ExecuteTaskDto } from './dto/execute-task.dto';

@Injectable()
export class TaskManagerService {
  private readonly logger = new Logger(TaskManagerService.name);

  private readonly docker: Docker =
    process.platform === 'win32'
      ? new Docker({ socketPath: '//./pipe/docker_engine' })
      : new Docker({ socketPath: '/var/run/docker.sock' });

  constructor(@InjectQueue('jobs') private readonly jobsQueue: Queue) {}

  async execute(taskDto: ExecuteTaskDto): Promise<string> {
    this.logger.log(
      `Received task execution: ${taskDto.command.substring(0, 40)}...`,
    );

    const jobId = uuidv4();

    await this.jobsQueue.add(
      'run-isolated-task',
      {
        taskId: jobId,
        repoUrl: taskDto.repoUrl,
        imageName: taskDto.imageName,
        command: taskDto.command,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );

    this.logger.log(`Job dispatched: ${jobId}`);
    return jobId;
  }

  async runJob(data: {
    taskId: string;
    repoUrl: string;
    imageName: string;
    command: string;
  }): Promise<{ logs: string; exitCode: number }> {
    const { taskId, imageName, command } = data;
    const containerName = `executor-${taskId}`.substring(0, 63);

    try {
      this.logger.log(`[${taskId}] Spawning container: ${imageName}`);

      await this.ensureImage(imageName);

      const container = await this.docker.createContainer({
        Image: imageName,
        name: containerName,
        Cmd: ['sh', '-c', command],
        AttachStdout: true,
        AttachStderr: true,
        Tty: false,
        HostConfig: {
          AutoRemove: false,
          NetworkMode: 'none',
        },
      });

      await container.start();

      const waitResult = await container.wait();
      const exitCode =
        typeof waitResult?.StatusCode === 'number' ? waitResult.StatusCode : 1;

      const logBuffer = await container.logs({
        stdout: true,
        stderr: true,
        follow: false,
      });

      const logs = this.demuxDockerLogs(logBuffer);

      try {
        await container.remove({ force: true });
      } catch {
        // ignore cleanup errors
      }

      this.logger.log(
        `[${taskId}] Finished with exitCode=${exitCode}. logs=${logs.slice(0, 200)}`,
      );

      return { logs, exitCode };
    } catch (error: any) {
      this.logger.error(`Job Failed: ${error?.message || String(error)}`);
      throw new InternalServerErrorException(
        `Execution Error: ${error?.message || String(error)}`,
      );
    }
  }

  private async ensureImage(imageName: string): Promise<void> {
    try {
      await this.docker.getImage(imageName).inspect();
      return;
    } catch {
      this.logger.log(`Image not found locally. Pulling: ${imageName}`);
    }

    await new Promise<void>((resolve, reject) => {
      this.docker.pull(
        imageName,
        (err: Error | null, stream: NodeJS.ReadableStream) => {
          if (err) {
            reject(err);
            return;
          }

          this.docker.modem.followProgress(
            stream,
            (pullErr: Error | null) => {
              if (pullErr) {
                reject(pullErr);
              } else {
                resolve();
              }
            },
          );
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