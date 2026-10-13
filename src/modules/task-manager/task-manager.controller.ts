import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  NotFoundException,
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
      taskId: taskId,
    };
  }

  @Get(':id')
  async getTaskStatus(@Param('id') id: string) {
    const task = this.taskManagerService.getTaskDetails(id);

    if (!task) {
      throw new NotFoundException(`Task with ID '${id}' was not found.`);
    }

    return {
      statusCode: HttpStatus.OK,
      data: task,
    };
  }

  @Get()
  async getAllTasks() {
    const tasks = this.taskManagerService.listAllTasks();

    return {
      statusCode: HttpStatus.OK,
      count: tasks.length,
      data: tasks,
    };
  }
}