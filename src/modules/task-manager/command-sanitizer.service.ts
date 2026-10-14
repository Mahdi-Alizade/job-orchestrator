import { Injectable, Logger, BadRequestException } from '@nestjs/common';

@Injectable()
export class CommandSanitizerService {
  private readonly logger = new Logger(CommandSanitizerService.name);

  // لیست الگوهای ممنوعه و مسدودشده برای محیط‌های سندباکس
  private readonly blacklistedPatterns: RegExp[] = [
    /rm\s+-rf\s+\/($|\s)/i,            // حذف کامل ریشه دیسک
    /mkfs(\.[a-z0-9]+)?\s+/i,          // فرمت کردن پارتیشن‌ها
    /dd\s+if=.*of=\/dev\/.*/i,          // دستکاری مستقیم بلاک‌های سخت‌افزاری
    /:(){ :\|:& };:/,                  // فورک‌بمب کلاسیک
    />\s*\/dev\/sd[a-z]/i,             // نوشتن مستقیم روی هارد
  ];

  sanitizeAndValidate(rawCommand: string): string {
    const trimmed = rawCommand.trim();

    if (!trimmed || trimmed.length === 0) {
      throw new BadRequestException('Execution command cannot be empty.');
    }

    if (trimmed.length > 500) {
      throw new BadRequestException('Command exceeds maximum permitted length of 500 characters.');
    }

    for (let i = 0; i < this.blacklistedPatterns.length; i++) {
      const pattern = this.blacklistedPatterns[i];
      if (pattern.test(trimmed)) {
        this.logger.warn(`Security violation detected! Malicious pattern matched: ${pattern}`);
        throw new BadRequestException(
          'Command rejected: contains blocked dangerous system instructions.',
        );
      }
    }

    return trimmed;
  }
}