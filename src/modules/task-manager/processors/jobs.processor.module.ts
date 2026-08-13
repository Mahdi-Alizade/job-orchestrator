import { Module } from '@nestjs/common';
import { JobsProcessor } from './jobs.processor';
import { TaskManagerModule } from '../task-manager.module';

@Module({
  imports: [TaskManagerModule], // حالا سرویس در دسترس است
  providers: [JobsProcessor],
  exports: [JobsProcessor],
})
export class ProcessorsModule {}