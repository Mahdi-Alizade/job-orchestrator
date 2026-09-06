import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TaskManagerService } from './task-manager.service';
import { ExecuteTaskDto } from './dto/execute-task.dto';

@Controller('tasks')
export class TaskManagerController {
  constructor(private readonly taskManagerService: TaskManagerService) {}

  @Post('execute')
  @HttpCode(HttpStatus.ACCEPTED)
  async executeTask(@Body() executeTaskDto: ExecuteTaskDto) {
    const taskId = await this.taskManagerService.execute(executeTaskDto);

    return {
      statusCode: HttpStatus.ACCEPTED,
      message: 'Task successfully enqueued for execution',
      taskId,
    };
  }
}