import { Injectable, Logger } from '@nestjs/common';
import { WebhookSignerService } from './webhook-signer.service';

export interface WebhookNotificationPayload {
  taskId: string;
  status: string;
  exitCode: number | null;
  startedAt: string;
  finishedAt: string | null;
  logsPreview: string;
  peakMemoryMb?: number;
}

@Injectable()
export class WebhookDispatcherService {
  private readonly logger = new Logger(WebhookDispatcherService.name);

  // تایم‌اوت ۱۰ ثانیه‌ای برای پاسخ سرور دریافت‌کننده وب‌هوک
  private readonly requestTimeoutMs = 10000;

  constructor(private readonly signerService: WebhookSignerService) {}

  async dispatchEvent(
    targetUrl: string,
    secretKey: string | undefined,
    data: WebhookNotificationPayload,
  ): Promise<boolean> {
    const trimmedUrl = targetUrl.trim();

    if (!trimmedUrl) {
      this.logger.warn('No valid callback URL provided for webhook.');
      return false;
    }

    const payloadString = JSON.stringify(data);
    const headersMap: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Secure-Job-Orchestrator-Webhook-Engine/1.0',
    };

    // اگر کلید محرمانه وجود داشت، امضای دیجیتال اضافه می‌شود
    if (secretKey) {
      const generatedSignature = this.signerService.generateSignature(
        payloadString,
        secretKey,
      );
      if (generatedSignature) {
        headersMap['x-orchestrator-signature-256'] = generatedSignature;
      }
    }

    this.logger.log(`Dispatching webhook for task [${data.taskId}] to ${trimmedUrl}...`);

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, this.requestTimeoutMs);

    try {
      const fetchResponse = await fetch(trimmedUrl, {
        method: 'POST',
        headers: headersMap,
        body: payloadString,
        signal: abortController.signal,
      });

      clearTimeout(timeoutId);

      const responseStatus = fetchResponse.status;
      const isSuccess = responseStatus >= 200 && responseStatus < 300;

      if (isSuccess) {
        this.logger.log(`Webhook successfully delivered for task [${data.taskId}]. Status: ${responseStatus}`);
        return true;
      }

      this.logger.warn(`Webhook endpoint responded with non-2xx status: ${responseStatus}`);
      return false;
    } catch (dispatchError: any) {
      clearTimeout(timeoutId);
      const errorMessage = dispatchError?.message || String(dispatchError);
      this.logger.error(`Failed to dispatch webhook for task [${data.taskId}]: ${errorMessage}`);
      return false;
    }
  }
}