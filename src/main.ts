import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueueScheduler } from 'bullmq';
import { AppModule } from './app.module';
import { JobsProcessor } from './modules/task-manager/processors/jobs.processor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api/v1');
  
  const configService = app.get(ConfigService);
  const port = configService.get<number>('port', 3000);

  // Initialize Queue Scheduler to handle the queues
  // This must match the connection settings in app.module.ts
  const scheduler = new QueueScheduler('jobs', {
    connection: {
      host: configService.get<string>('redis.host'),
      port: configService.get<number>('redis.port'),
    },
  });

  console.log(`[Scheduler] Listening on port ${configService.get<number>('redis.port')}`);

  await app.listen(port);
  console.log(`[Orchestrator API] Running securely on port ${port}`);
}

bootstrap();