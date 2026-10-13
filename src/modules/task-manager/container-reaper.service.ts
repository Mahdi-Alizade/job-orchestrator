import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import Docker from 'dockerode';

@Injectable()
export class ContainerReaperService {
  private readonly logger = new Logger(ContainerReaperService.name);

  private readonly dockerClient: Docker =
    process.platform === 'win32'
      ? new Docker({ socketPath: '//./pipe/docker_engine' })
      : new Docker({ socketPath: '/var/run/docker.sock' });

  private readonly maxAllowedLifetimeMs = 2 * 60 * 1000;

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleReaperCron(): Promise<void> {
    this.logger.log('Reaper daemon started checking for abandoned containers...');

    try {
      const containerList = await this.dockerClient.listContainers({
        all: true,
      });

      const currentTime = Date.now();

      for (let i = 0; i < containerList.length; i++) {
        const item = containerList[i];
        const names = item.Names || [];

        let isManaged = false;
        let matchedName = '';

        for (let j = 0; j < names.length; j++) {
          const rawName = names[j];
          if (rawName.includes('orchestrator-task-')) {
            isManaged = true;
            matchedName = rawName;
            break;
          }
        }

        if (!isManaged) {
          continue;
        }

        const createdSeconds = item.Created;
        const createdMs = createdSeconds * 1000;
        const containerAge = currentTime - createdMs;

        if (containerAge > this.maxAllowedLifetimeMs) {
          this.logger.warn(
            `Found stuck container [${matchedName}] with age ${Math.round(containerAge / 1000)}s. Terminating...`,
          );

          await this.killAndCleanContainer(item.Id);
        }
      }

      this.logger.log('Reaper daemon cycle finished.');
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      this.logger.error(`Failed to scan for orphan containers: ${errMsg}`);
    }
  }

  private async killAndCleanContainer(containerId: string): Promise<void> {
    try {
      const containerHandle = this.dockerClient.getContainer(containerId);

      try {
        await containerHandle.kill();
      } catch (e) {
        // نادیده گرفتن خطا در صورتی که کانتینر قبلاً خاموش شده باشد
      }

      await containerHandle.remove({
        force: true,
        v: true,
      });

      this.logger.log(`Container ${containerId.substring(0, 12)} successfully removed.`);
    } catch (removeErr: any) {
      const msg = removeErr?.message || String(removeErr);
      this.logger.error(`Could not clean container ${containerId}: ${msg}`);
    }
  }
}