import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { TaskManagerModule } from './modules/task-manager/task-manager.module';
import configuration from './config/configuration';

@Module({
  imports: [
    // Global Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    
    // Redis / Job Queue Setup (Securely connected via ENV)
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get('redis.host'),
          port: configService.get('redis.port'),
          password: configService.get('redis.password'), // Optional but recommended
        },
      }),
    }),
    
    // Feature Module
    TaskManagerModule,
  ],
})
export class AppModule {}