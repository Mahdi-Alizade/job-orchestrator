import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import Docker from 'dockerode';
import { ExecuteTaskDto } from './dto/execute-task.dto';

@Injectable()
export class TaskManagerService {
  private readonly logger = new Logger(TaskManagerService.name);
  private readonly docker = new Docker();

  constructor(
    @InjectQueue('jobs') private readonly jobsQueue: Queue,
  ) {}

  async execute(taskDto: ExecuteTaskDto): Promise<string> {
    // 1. Generate a unique ID for tracking this execution
    const jobId = uuidv4();

    // 2. Add job to the Redis Queue
    await this.jobsQueue.add(
      'run-isolated-task', 
      { taskId: jobId, ...taskDto },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      }
    );

    this.logger.log(`Job added to queue: ${jobId}`);
    return jobId;
  }

  /**
   * THIS IS THE CORE EXECUTOR LOGIC
   * Runs inside the BullMQ worker processor
   */
  async runJob(data: { taskId: string; repoUrl: string; imageName: string; command: string }): Promise<{ logs: string; exitCode: number }> {
    const { taskId, repoUrl, imageName, command } = data;
    const containerName = `executor-${taskId}`;

    try {
      // 1. Pull image if not exists (optional optimization: pull only if missing)
      this.logger.log(`Pulling image ${imageName} for job ${taskId}`);
      
      // 2. Create the isolated container
      const container = await this.docker.createContainer({
        Image: imageName,
        Hostname: containerName,
        name: containerName,
        Tty: true,
        OpenStdin: true,
        DetachKeys: 'ctrl-c',
        Cmd: ['sh', '-c', command],
      });

      // 3. Start the container
      await container.start();

      // 4. Attach to logs stream to capture stdout/stderr
      const stream = await container.logs({ 
        stdout: true, 
        stderr: true, 
        follow: false // Wait for completion
      });

      // Helper to collect stream chunks
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const logs = Buffer.concat(chunks).toString('utf8');

      // 5. Inspect for exit code
      const info = await container.inspect();
      const exitCode = info.State.ExitCode;

      // 6. Cleanup (Kill & Remove)
      try {
        await container.kill();
      } catch (e) {
        this.logger.warn(`Container ${containerName} already exited.`);
      }
      try {
        await container.remove();
      } catch (e) {
        this.logger.error(`Failed to remove container ${containerName}`);
      }

      return { logs, exitCode };

    } catch (error) {
      throw new InternalServerErrorException(`Execution failed: ${error.message}`);
    }
  }
}