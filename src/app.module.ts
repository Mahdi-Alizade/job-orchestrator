import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { TaskManagerModule } from './modules/task-manager/task-manager.module';
import { ProcessorsModule } from './modules/task-manager/processors/jobs.processor.module'; // این خط اضافه شد
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get('redis.host'),
          port: configService.get('redis.port'),
          password: configService.get('redis.password'),
        },
      }),
    }),
    TaskManagerModule,
    ProcessorsModule // اینجا هم اضافه شد
  ],
})
export class AppModule {}