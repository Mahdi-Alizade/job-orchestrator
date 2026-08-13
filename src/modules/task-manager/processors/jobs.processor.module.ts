import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { JobsProcessor } from './jobs.processor';
import { TaskManagerModule } from '../task-manager.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'jobs' }),
    TaskManagerModule,
  ],
  providers: [JobsProcessor],
})
export class ProcessorsModule {}