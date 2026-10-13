import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TaskManagerController } from './task-manager.controller';
import { TaskManagerService } from './task-manager.service';
import { DockerExecutorService } from './docker-executor.service';
import { ContainerReaperService } from './container-reaper.service';
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
    ContainerReaperService,
    JobsProcessor,
  ],
  exports: [
    TaskManagerService,
    DockerExecutorService,
    ContainerReaperService,
  ],
})
export class TaskManagerModule {}