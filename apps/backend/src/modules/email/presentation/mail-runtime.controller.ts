import { Controller, Get } from '@nestjs/common';

import { itemResponse } from '../../../common/http/api-response.js';
import { MailRuntimeConfigService } from '../infrastructure/config/mail-runtime-config.service.js';

@Controller('runtime-config')
export class MailRuntimeController {
  constructor(private readonly config: MailRuntimeConfigService) {}

  @Get()
  get() {
    return itemResponse({
      mailOperationMode: this.config.operationMode,
      imapPollEnabled: this.config.imapPollEnabled,
    });
  }
}
