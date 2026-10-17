import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Sse,
  NotFoundException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { TaskManagerService } from './task-manager.service';
import { ExecuteTaskDto } from './dto/execute-task.dto';
import { TaskRecord } from './task-state.service';

export class CancelTaskDto {
  reason?: string;
}

@Controller('tasks')
export class TaskManagerController {
  constructor(private readonly taskManagerService: TaskManagerService) {}

  @Post('execute')
  async executeTask(@Body() executeTaskDto: ExecuteTaskDto): Promise<{ taskId: string }> {
    const generatedTaskId = await this.taskManagerService.execute(executeTaskDto);
    return { taskId: generatedTaskId };
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelTask(
    @Param('id') taskId: string,
    @Body() cancelDto?: CancelTaskDto,
  ): Promise<{ success: boolean; message: string }> {
    const result = await this.taskManagerService.cancelTask(taskId, cancelDto?.reason);
    return result;
  }

  @Get(':id')
  getTaskDetails(@Param('id') taskId: string): TaskRecord {
    const record = this.taskManagerService.getTaskDetails(taskId);
    if (!record) {
      throw new NotFoundException(`Task with ID "${taskId}" not found.`);
    }
    return record;
  }

  @Get()
  listAllTasks(): TaskRecord[] {
    return this.taskManagerService.listAllTasks();
  }

  @Sse(':id/logs')
  streamLogs(@Param('id') taskId: string): Observable<{ data: string }> {
    return this.taskManagerService.getTaskLiveLogStream(taskId);
  }
}