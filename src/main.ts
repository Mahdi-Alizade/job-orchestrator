import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

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
  const port = configService.get<number>('port') || 3000;

  // BullMQ Scheduler is handled automatically by @nestjs/bullmq 
  // when Processors are registered in the module graph.
  // No manual instantiation is required.

  await app.listen(port);
  console.log(`[Orchestrator API] Running securely on port ${port}`);
}

bootstrap();