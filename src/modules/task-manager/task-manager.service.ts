import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import Docker, { Container } from 'dockerode';
import { v4 as uuidv4 } from 'uuid';
import { ExecuteTaskDto } from './dto/execute-task.dto';

@Injectable()
export class TaskManagerService {
  private readonly logger = new Logger(TaskManagerService.name);
  
  // تنظیم صریح هاست داکر برای محیط ویندوز جهت جلوگیری از بلاتکلیفی
  private readonly docker: Docker = new Docker({
    host: process.platform === 'win32' ? 'npipe:////./pipe/docker_engine' : undefined
  });

  constructor(
    @InjectQueue('jobs') private readonly jobsQueue: Queue,
  ) {}

  async execute(taskDto: ExecuteTaskDto): Promise<string> {
    this.logger.log(`Received task execution: ${taskDto.command.substring(0, 20)}...`);
    
    const jobId = uuidv4();

    // Push to queue immediately to minimize API latency
    await this.jobsQueue.add(
      'run-isolated-task', 
      { 
        taskId: jobId, 
        repoUrl: taskDto.repoUrl, 
        imageName: taskDto.imageName, 
        command: taskDto.command 
      },
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 } }
    );

    this.logger.log(`Job dispatched: ${jobId}`);
    return jobId;
  }

  /**
   * Worker: Executes inside the BullMQ process
   */
  async runJob(data: { taskId: string; repoUrl: string; imageName: string; command: string }): Promise<{ logs: string; exitCode: number }> {
    const { taskId, imageName, command } = data;
    const containerName = `executor-${taskId}`;

    try {
      this.logger.log(`[${taskId}] Spawning container: ${imageName}`);
      
      const container = await this.docker.createContainer({
        Image: imageName,
        name: containerName,
        // Command execution logic
        Cmd: ['sh', '-c', command],
        AttachStdout: true,
        AttachStderr: true,
        Tty: false, // Disable TTY for raw stream output and faster boot
        OpenStdin: false,
      });

      await container.start();
      
      // Wait for completion and capture raw logs
      const output = await container.logs({ stdout: true, stderr: true });
      
      let logs = '';
      if (output instanceof Array) {
         logs = output.join('');
      } else {
         for await (const chunk of output) { 
            logs += chunk.toString(); 
         }
      }

      const info = await container.inspect();
      const exitCode = info.State.ExitCode;

      // Cleanup
      try {
        await container.kill();
        await container.remove();
      } catch (e) { /* Ignore cleanup errors */ }

      return { logs, exitCode };

    } catch (error: any) {
      this.logger.error(`Job Failed: ${error.message}`);
      throw new InternalServerErrorException(`Execution Error: ${error.message}`);
    }
  }
}