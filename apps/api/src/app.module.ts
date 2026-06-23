import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ContextModule } from './modules/context/context.module.js';
import { EmailModule } from './modules/email/email.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { InquiryModule } from './modules/inquiry/inquiry.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    HealthModule,
    ContextModule,
    InquiryModule,
    EmailModule,
  ],
})
export class AppModule {}
