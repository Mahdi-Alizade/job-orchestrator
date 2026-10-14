import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TaskManagerController } from './task-manager.controller';
import { TaskManagerService } from './task-manager.service';
import { TaskStateService } from './task-state.service';
import { DockerExecutorService } from './docker-executor.service';
import { ContainerReaperService } from './container-reaper.service';
import { WorkspaceManagerService } from './workspace-manager.service';
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
    TaskStateService,
    DockerExecutorService,
    ContainerReaperService,
    WorkspaceManagerService,
    JobsProcessor,
  ],
  exports: [
    TaskManagerService,
    TaskStateService,
    DockerExecutorService,
    ContainerReaperService,
    WorkspaceManagerService,
  ],
})
export class TaskManagerModule {}