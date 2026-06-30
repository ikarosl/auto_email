import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { cwd } from 'node:process';
import { fileURLToPath } from 'node:url';

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { DatabaseModule } from './common/database/database.module.js';
import { ContextModule } from './modules/context/context.module.js';
import { EmailModule } from './modules/email/email.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { InquiryModule } from './modules/inquiry/inquiry.module.js';

/** 向上递归查找 .env，因为 pnpm workspace 的 CWD 可能在子包目录 */
function findEnvFile(): string | undefined {
  const candidates: string[] = [cwd()];
  let dir = fileURLToPath(import.meta.url);
  for (let i = 0; i < 10; i += 1) {
    dir = dirname(dir);
    candidates.push(dir);
  }
  for (const candidate of candidates) {
    const envPath = join(candidate, '.env');
    if (existsSync(envPath)) return envPath;
  }
  return undefined;
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: findEnvFile(),
    }),
    DatabaseModule,
    HealthModule,
    ContextModule,
    InquiryModule,
    EmailModule,
  ],
})
export class AppModule {}
