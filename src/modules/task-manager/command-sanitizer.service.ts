import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PipelineStep } from './pipeline-step.interface';

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

  validatePipelineSteps(steps: PipelineStep[]): PipelineStep[] {
    if (!steps || steps.length === 0) {
      throw new BadRequestException('Pipeline must contain at least one execution step.');
    }

    if (steps.length > 15) {
      throw new BadRequestException('A single pipeline cannot exceed 15 sequential steps.');
    }

    const validatedStepsList: PipelineStep[] = [];

    for (let index = 0; index < steps.length; index++) {
      const currentStep = steps[index];
      const stepName = currentStep.name ? currentStep.name.trim() : `step-${index + 1}`;
      const rawStepCommand = currentStep.command;

      // بررسی امنیتی دستور این مرحله از طریق متد تک‌دستور
      const cleanedCommand = this.sanitizeAndValidate(rawStepCommand);

      const validatedStepItem: PipelineStep = {
        name: stepName,
        command: cleanedCommand,
        continueOnError: Boolean(currentStep.continueOnError),
      };

      validatedStepsList.push(validatedStepItem);
    }

    return validatedStepsList;
  }
}