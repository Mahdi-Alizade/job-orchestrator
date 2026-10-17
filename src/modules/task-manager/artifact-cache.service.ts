import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

@Injectable()
export class ArtifactCacheService implements OnModuleInit {
  private readonly logger = new Logger(ArtifactCacheService.name);

  // دایرکتوری پایه ذخیره کش روی ماشین هاست
  private readonly baseCacheDirectory = path.join(process.cwd(), '.orchestrator-cache');

  async onModuleInit(): Promise<void> {
    try {
      await fs.mkdir(this.baseCacheDirectory, { recursive: true });
      this.logger.log(`Cache storage directory initialized at: ${this.baseCacheDirectory}`);
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      this.logger.error(`Failed to initialize cache directory: ${errorMsg}`);
    }
  }

  generateCacheKey(identifier: string): string {
    const trimmedInput = identifier.trim();
    const hash = crypto.createHash('sha256').update(trimmedInput).digest('hex');
    const safeKey = hash.substring(0, 16);
    return safeKey;
  }

  getCachePath(cacheKey: string): string {
    const sanitizedKey = cacheKey.replace(/[^a-zA-Z0-9_-]/g, '');
    const resolvedPath = path.join(this.baseCacheDirectory, sanitizedKey);
    return resolvedPath;
  }

  async ensureCacheDirectory(cacheKey: string): Promise<string> {
    const cachePath = this.getCachePath(cacheKey);
    await fs.mkdir(cachePath, { recursive: true });
    return cachePath;
  }

  async hasCache(cacheKey: string): Promise<boolean> {
    const targetPath = this.getCachePath(cacheKey);
    try {
      await fs.access(targetPath);
      return true;
    } catch {
      return false;
    }
  }
}