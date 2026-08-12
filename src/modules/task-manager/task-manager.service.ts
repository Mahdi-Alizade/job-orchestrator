import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import Docker, { Container } from 'dockerode';
import { v4 as uuidv4 } from 'uuid';
import { ExecuteTaskDto } from './dto/execute-task.dto';
import { Readable } from 'stream';

@Injectable()
export class TaskManagerService {
  private readonly logger = new Logger(TaskManagerService.name);
  private readonly docker: Docker = new Docker();

  constructor(
    @InjectQueue('jobs') private readonly jobsQueue: Queue,
  ) {}

  async execute(taskDto: ExecuteTaskDto): Promise<string> {
    const jobId = uuidv4();

    await this.jobsQueue.add(
      'run-isolated-task', 
      { taskId: jobId, ...taskDto },
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 } }
    );

    this.logger.log(`Job added to queue: ${jobId}`);
    return jobId;
  }

  async runJob(data: { taskId: string; repoUrl: string; imageName: string; command: string }): Promise<{ logs: string; exitCode: number }> {
    const { taskId, repoUrl, imageName, command } = data;
    const containerName = `executor-${taskId}`;

    try {
      this.logger.log(`Pulling image ${imageName} for job ${taskId}`);
      
      // Pull image logic skipped for brevity, assuming local or auto-pull works
      
      const containerOptions = {
        Image: imageName,
        Tty: true,
        OpenStdin: true,
        Cmd: ['sh', '-c', command],
        Hostname: containerName,
        name: containerName,
        NetworkSettings: { Networks: {} } as any, // Workaround for TS strictness
      };

      const container = await this.docker.createContainer(containerOptions);

      await container.start();
      
      // We wait until the container exits to get logs/exit code
      // Using attach ensures we follow the stream until EOF
      const stream = await container.attach({ stream: true, stdout: 1, stderr: 1, stdin: false });
      
      let logs = '';
      await new Promise<void>((resolve, reject) => {
        stream.on('data', (chunk) => {
          logs += chunk.toString();
        });
        stream.on('end', () => {
          resolve();
        });
        stream.on('err', (err) => {
          reject(err);
        });
      });

      // Get info after exit
      const info = await container.inspect();
      const exitCode = info.State.ExitCode;

      // Cleanup
      await container.kill();
      await container.remove();

      return { logs, exitCode };

    } catch (error) {
      this.logger.error(error.message);
      throw new InternalServerErrorException(`Execution failed: ${error.message}`);
    }
  }
}