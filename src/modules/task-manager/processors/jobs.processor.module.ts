import { Module } from '@nestjs/common';
import { JobsProcessor } from './jobs.processor';

@Module({
  providers: [JobsProcessor],
  exports: [JobsProcessor],
})
export class ProcessorsModule {}