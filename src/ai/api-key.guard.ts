import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
    Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiKeyGuard implements CanActivate {
    private readonly logger = new Logger(ApiKeyGuard.name);
    constructor(private configService: ConfigService) { }

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        const apiKey = request.headers['x-api-key'];
        const expectedKey = this.configService.get<string>('ADMIN_API_KEY');

        if (!expectedKey) {
            this.logger.error('❌ ADMIN_API_KEY is not set in environment variables! Blocking all admin requests for safety.');
            return false;
        }

        if (apiKey !== expectedKey) {
            throw new UnauthorizedException('Invalid or missing API Key');
        }

        return true;
    }
}
