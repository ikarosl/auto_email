import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import { BusinessErrorFilter } from './common/filters/business-error.filter.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.API_PORT ?? 3000);
  const host = process.env.API_HOST ?? '0.0.0.0';

  app.useGlobalFilters(new BusinessErrorFilter());
  app.enableShutdownHooks();

  await app.listen(port, host);
}

void bootstrap();
