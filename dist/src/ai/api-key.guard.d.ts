import { CanActivate, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
export declare class ApiKeyGuard implements CanActivate {
    private configService;
    private readonly logger;
    constructor(configService: ConfigService);
    canActivate(context: ExecutionContext): boolean;
}
