import { Test, TestingModule } from '@nestjs/testing';
import { MetaWebhookController } from './meta-webhook.controller';

describe('MetaWebhookController', () => {
  let controller: MetaWebhookController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetaWebhookController],
    }).compile();

    controller = module.get<MetaWebhookController>(MetaWebhookController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
