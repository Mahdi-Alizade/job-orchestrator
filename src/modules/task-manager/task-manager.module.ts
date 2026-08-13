import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TaskManagerController } from './task-manager.controller';
import { TaskManagerService } from './task-manager.service';

@Module({
  imports: [BullModule.registerQueue({ name: 'jobs' })],
  controllers: [TaskManagerController],
  providers: [TaskManagerService],
  exports: [TaskManagerService], // این خط مشکل DI را حل می‌کند
})
export class TaskManagerModule {}