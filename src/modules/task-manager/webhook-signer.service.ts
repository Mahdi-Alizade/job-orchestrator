import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class WebhookSignerService {
  private readonly logger = new Logger(WebhookSignerService.name);

  generateSignature(payloadString: string, secretKey: string): string {
    const trimmedSecret = secretKey.trim();

    if (!trimmedSecret) {
      this.logger.warn('Empty secret provided for HMAC calculation. Skipping signature.');
      return '';
    }

    const hmacInstance = crypto.createHmac('sha256', trimmedSecret);
    hmacInstance.update(payloadString, 'utf8');

    const calculatedDigest = hmacInstance.digest('hex');
    const signatureHeaderValue = `sha256=${calculatedDigest}`;

    return signatureHeaderValue;
  }
}