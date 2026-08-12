import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import Docker, { Container } from 'dockerode';
import { v4 as uuidv4 } from 'uuid';
import { ExecuteTaskDto } from './dto/execute-task.dto';

@Injectable()
export class TaskManagerService {
  private readonly logger = new Logger(TaskManagerService.name);
  private readonly docker: Docker = new Docker();

  constructor(
    @InjectQueue('jobs') private readonly jobsQueue: Queue,
  ) {}

  /**
   * Accepts a task and pushes it to the Redis queue.
   */
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

  /**
   * Core logic: Spawns a container, runs command, captures logs, kills container.
   */
  async runJob(data: { taskId: string; repoUrl: string; imageName: string; command: string }): Promise<{ logs: string; exitCode: number }> {
    const { taskId, imageName, command } = data;
    const containerName = `executor-${taskId}`;

    try {
      this.logger.log(`Spawning container for job ${taskId}...`);
      
      // 1. Create Container
      const container = await this.docker.createContainer({
        Image: imageName,
        name: containerName,
        Cmd: ['sh', '-c', command],
        AttachStdout: true,
        AttachStderr: true,
      });

      // 2. Start Container
      await container.start();

      // 3. Wait for completion and get logs
      // logs() with no flags waits for finish and returns a Readable stream
      const output = await container.logs({ stdout: true, stderr: true });
      
      let logs = '';
      // Modern Node.js streaming
      for await (const chunk of output) {
        logs += chunk.toString();
      }

      // 4. Inspect Container State
      const info = await container.inspect();
      const exitCode = info.State.ExitCode;

      // 5. Cleanup (Kill is safe even if already exited)
      await container.kill();
      await container.remove();

      return { logs, exitCode };

    } catch (error: any) {
      this.logger.error(`Execution failed: ${error.message}`);
      throw new InternalServerErrorException(`Docker execution failed: ${error.message}`);
    }
  }
}