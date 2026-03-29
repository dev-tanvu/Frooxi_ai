import { Test, TestingModule } from '@nestjs/testing';
import { MetaWebhookService } from './meta-webhook.service';

describe('MetaWebhookService', () => {
  let service: MetaWebhookService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MetaWebhookService],
    }).compile();

    service = module.get<MetaWebhookService>(MetaWebhookService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
