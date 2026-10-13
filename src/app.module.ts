import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { TaskManagerModule } from './modules/task-manager/task-manager.module';
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const host = configService.get<string>('redis.host');
        const port = configService.get<number>('redis.port');
        const password = configService.get<string | undefined>('redis.password');

        const redisConnectionOptions = {
          host: host,
          port: port,
          password: password,
        };

        return {
          connection: redisConnectionOptions,
        };
      },
    }),
    TaskManagerModule,
  ],
})
export class AppModule {}