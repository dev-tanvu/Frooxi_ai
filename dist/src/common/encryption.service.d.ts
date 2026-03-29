import { ConfigService } from '@nestjs/config';
export declare class EncryptionService {
    private configService;
    private readonly logger;
    private readonly algorithm;
    private readonly key;
    constructor(configService: ConfigService);
    encrypt(text: string): string;
    decrypt(encryptedText: string): string;
}
