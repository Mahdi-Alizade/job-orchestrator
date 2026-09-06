import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TaskManagerController } from './task-manager.controller';
import { TaskManagerService } from './task-manager.service';
import { DockerExecutorService } from './docker-executor.service';
import { JobsProcessor } from './processors/jobs.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'jobs',
    }),
  ],
  controllers: [TaskManagerController],
  providers: [
    TaskManagerService,
    DockerExecutorService,
    JobsProcessor,
  ],
  exports: [TaskManagerService, DockerExecutorService],
})
export class TaskManagerModule {}