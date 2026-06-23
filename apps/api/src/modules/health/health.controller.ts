import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return {
      status: 'ok',
      service: 'email-inquiry-system',
      timestamp: new Date().toISOString(),
    };
  }
}
