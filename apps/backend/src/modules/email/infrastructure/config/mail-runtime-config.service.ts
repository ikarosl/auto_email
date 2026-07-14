import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

export type MailOperationMode = 'debug' | 'production';

export interface SmtpRuntimeConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromEmail: string;
  fromName: string;
}

@Injectable()
export class MailRuntimeConfigService implements OnModuleInit {
  private readonly logger = new Logger(MailRuntimeConfigService.name);
  readonly operationMode: MailOperationMode;
  readonly imapPollEnabled: boolean;
  readonly smtp?: SmtpRuntimeConfig;

  constructor() {
    this.operationMode = parseOperationMode(process.env.MAIL_OPERATION_MODE);
    this.imapPollEnabled = parseBoolean(process.env.IMAP_POLL_ENABLED, false);
    this.smtp = this.operationMode === 'production' ? readSmtpConfig() : undefined;
  }

  onModuleInit(): void {
    this.logger.log(
      `Mail operation mode=${this.operationMode}, IMAP polling=${this.imapPollEnabled ? 'enabled' : 'disabled'}`,
    );
  }
}

function parseOperationMode(value?: string): MailOperationMode {
  const normalized = (value ?? 'debug').trim().toLowerCase();
  if (normalized === 'debug' || normalized === 'production') return normalized;
  throw new Error('MAIL_OPERATION_MODE must be either debug or production.');
}

function readSmtpConfig(): SmtpRuntimeConfig {
  const required = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM_EMAIL'] as const;
  const missing = required.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Production mail mode requires: ${missing.join(', ')}`);
  }

  const port = Number(process.env.SMTP_PORT ?? 465);
  if (!Number.isInteger(port) || port <= 0) throw new Error('SMTP_PORT must be a positive integer.');

  return {
    host: process.env.SMTP_HOST!,
    port,
    secure: parseBoolean(process.env.SMTP_SECURE, port === 465),
    user: process.env.SMTP_USER!,
    pass: process.env.SMTP_PASS!,
    fromEmail: process.env.SMTP_FROM_EMAIL!,
    fromName: process.env.SMTP_FROM_NAME?.trim() || 'Sales',
  };
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}
