import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class MetaSignatureGuard implements CanActivate {
  private readonly logger = new Logger(MetaSignatureGuard.name);

  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    
    // Skip signature verification for GET requests (used by Meta for webhook verification)
    if (request.method === 'GET') {
        return true;
    }

    const signature = request.headers['x-hub-signature-256'];
    const appSecret = this.configService.get<string>('META_APP_SECRET');

    if (!appSecret) {
      this.logger.error('❌ CRITICAL: META_APP_SECRET not found in environment. Blocking webhook verification.');
      throw new UnauthorizedException('Server configuration error');
    }

    if (!signature) {
      this.logger.error('❌ Missing X-Hub-Signature-256 header.');
      throw new UnauthorizedException('Missing signature');
    }

    const rawBody = request.rawBody;
    if (!rawBody) {
      this.logger.error('❌ Raw body not available for signature verification.');
      throw new UnauthorizedException('Raw body missing');
    }

    const elements = signature.split('=');
    const signatureHash = elements[1];

    const expectedHash = crypto
      .createHmac('sha256', appSecret)
      .update(rawBody)
      .digest('hex');

    if (signatureHash !== expectedHash) {
      this.logger.error('❌ Invalid X-Hub-Signature-256. Secret mismatch or spoofing detected!');
      throw new UnauthorizedException('Invalid signature');
    }

    this.logger.debug('✅ Webhook signature verified successfully.');
    return true;
  }
}
