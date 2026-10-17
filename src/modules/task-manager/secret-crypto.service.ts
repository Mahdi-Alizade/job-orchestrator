import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface EncryptedPayload {
  iv: string;
  authTag: string;
  cipherText: string;
}

@Injectable()
export class SecretCryptoService {
  private readonly logger = new Logger(SecretCryptoService.name);

  // الگوریتم استاندارد رمزنگاری متقارن
  private readonly algorithm = 'aes-256-gcm';
  private readonly masterKey: Buffer;

  constructor(private readonly configService: ConfigService) {
    const rawKey = this.configService.get<string>('ENCRYPTION_SECRET_KEY');

    if (rawKey && rawKey.trim().length >= 32) {
      // استفاده از کلید کانفیگ
      this.masterKey = crypto.createHash('sha256').update(rawKey).digest();
    } else {
      // کلید تصادفی موقت در صورت عدم تنظیم در .env
      this.logger.warn('ENCRYPTION_SECRET_KEY not configured or too short. Generating fallback ephemeral key.');
      this.masterKey = crypto.randomBytes(32);
    }
  }

  encryptSecret(plainText: string): EncryptedPayload {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(this.algorithm, this.masterKey, iv);

    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');

    return {
      iv: iv.toString('hex'),
      authTag: authTag,
      cipherText: encrypted,
    };
  }

  decryptSecret(payload: EncryptedPayload): string {
    const ivBuffer = Buffer.from(payload.iv, 'hex');
    const authTagBuffer = Buffer.from(payload.authTag, 'hex');

    const decipher = crypto.createDecipheriv(this.algorithm, this.masterKey, ivBuffer);
    decipher.setAuthTag(authTagBuffer);

    let decrypted = decipher.update(payload.cipherText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}