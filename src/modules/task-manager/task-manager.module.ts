import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TaskManagerController } from './task-manager.controller';
import { TaskManagerService } from './task-manager.service';
import { ProcessorsModule } from './processors/jobs.processor.module';

@Module({
  imports: [
    // Register the processor to consume from the queue
    BullModule.registerQueue({ name: 'jobs' }),
    ProcessorsModule,
  ],
  controllers: [TaskManagerController],
  providers: [TaskManagerService],
})
export class TaskManagerModule {}