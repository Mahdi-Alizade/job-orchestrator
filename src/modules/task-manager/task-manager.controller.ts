import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { TaskManagerService } from './task-manager.service';
import { ExecuteTaskDto } from './dto/execute-task.dto';

@Controller('tasks')
export class TaskManagerController {
  constructor(private readonly taskService: TaskManagerService) {}

  @Post('execute')
  @HttpCode(HttpStatus.ACCEPTED)
  async execute(@Body() taskDto: ExecuteTaskDto): Promise<{ jobId: string }> {
    const jobId = await this.taskService.execute(taskDto);
    return { jobId };
  }
}