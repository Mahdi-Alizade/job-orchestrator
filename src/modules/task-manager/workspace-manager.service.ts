import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

@Injectable()
export class WorkspaceManagerService {
  private readonly logger = new Logger(WorkspaceManagerService.name);

  async prepareWorkspace(taskId: string, repoUrl?: string): Promise<string> {
    const tempBaseDir = os.tmpdir();
    const folderName = `orchestrator-ws-${taskId}`;
    const workspacePath = path.join(tempBaseDir, folderName);

    // ساخت دایرکتوری در صورت عدم وجود
    if (!fs.existsSync(workspacePath)) {
      fs.mkdirSync(workspacePath, { recursive: true });
    }

    if (!repoUrl) {
      return workspacePath;
    }

    this.logger.log(`[${taskId}] Cloning repository: ${repoUrl}`);

    try {
      // استفاده از عمق ۱ برای سریع‌ترین سرعت و حداقل حجم
      const cloneCommand = `git clone --depth 1 "${repoUrl}" "${workspacePath}"`;
      await execAsync(cloneCommand, { timeout: 45000 });
      this.logger.log(`[${taskId}] Repository cloned successfully.`);
    } catch (cloneError: any) {
      const errorText = cloneError?.message || String(cloneError);
      this.logger.error(`[${taskId}] Git clone failed: ${errorText}`);
      // حتی اگر کلون با ارور روبرو شد، اجازه می‌دهیم دایرکتوری وجود داشته باشد
    }

    return workspacePath;
  }

  async cleanWorkspace(taskId: string, workspacePath: string): Promise<void> {
    if (!workspacePath || !fs.existsSync(workspacePath)) {
      return;
    }

    try {
      this.logger.log(`[${taskId}] Cleaning up temporary workspace files...`);
      fs.rmSync(workspacePath, { recursive: true, force: true });
      this.logger.log(`[${taskId}] Workspace cleaned successfully.`);
    } catch (cleanupError: any) {
      const msg = cleanupError?.message || String(cleanupError);
      this.logger.warn(`[${taskId}] Could not delete workspace folder: ${msg}`);
    }
  }
}