/**
 * IMAP 邮箱轮询 → 邮件同步入库 → AI 分析 核心引擎
 *
 * 业务逻辑：
 *   1. 启动 NestJS 应用时自动连接 IMAP
 *   2. 拉取邮箱 UID 列表，与数据库 processed_emails 比对去重
 *   3. 新邮件按 UID 升序排列，逐封拉取正文并解析
 *   4. 邮件入库 → 创建/匹配询盘 → AI 分析 → 保存分析结果
 *   5. 此后按 IMAP_POLL_INTERVAL_MS 定时轮询新邮件
 *
 * 这是整个系统的核心调度入口，随 NestJS 生命周期自动启停。
 */

import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

import { PrismaService } from '../../../../common/database/prisma.service.js';
import { InquiryStatus } from '../../../inquiry/domain/enums/inquiry-status.enum.js';
import {
  AnalyzeEmailWithAiResult,
  AnalyzeEmailWithAiUseCase,
} from '../../application/use-cases/analyze-email-with-ai.use-case.js';
import {
  PollEmailCandidate,
  PollEmailInboxUseCase,
} from '../../application/use-cases/poll-email-inbox.use-case.js';
import { EmailSource } from '../../domain/enums/email-source.enum.js';
import { InboundEmail } from '../../domain/value-objects/inbound-email.vo.js';
import { MailboxSyncService } from './mailbox-sync.service.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ImapConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  mailbox: string;
  pollIntervalMs: number;
  bootstrapMode: 'process_existing' | 'mark_existing_seen';
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class ImapPollService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ImapPollService.name);
  private client: ImapFlow | null = null;
  private config: ImapConfig | null = null;
  private mailboxAccountId = '';
  private shutdownRequested = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly pollUseCase: PollEmailInboxUseCase,
    private readonly syncService: MailboxSyncService,
    private readonly analyzeEmailWithAiUseCase: AnalyzeEmailWithAiUseCase,
  ) {}

  // -----------------------------------------------------------------------
  // Lifecycle — NestJS 应用启动/关闭
  // -----------------------------------------------------------------------

  async onApplicationBootstrap(): Promise<void> {
    if (!parseBoolean(process.env.IMAP_POLL_ENABLED, false)) {
      this.logger.warn('IMAP_POLL_ENABLED=false - skipping automatic mailbox polling.');
      return;
    }

    this.config = this.readConfig();
    if (!this.config) {
      this.logger.warn('IMAP 未配置 — 跳过邮箱轮询（请设置 IMAP_HOST/USER/PASS 环境变量）');
      return;
    }

    this.logger.log(`正在初始化 IMAP 邮箱轮询 — ${this.config.user}@${this.config.host}/${this.config.mailbox}`);

    try {
      // 1. 解析 MailboxAccount（不存在则自动创建）
      this.mailboxAccountId = await this.syncService.resolveMailboxAccountId(
        this.config.user,
        this.config.host,
      );

      // 2. 连接 IMAP
      this.client = new ImapFlow({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        auth: { user: this.config.user, pass: this.config.pass },
        logger: false,
      });
      await this.client.connect();
      this.logger.log(`IMAP 已连接: ${this.config.host}`);

      // 3. 首次启动：同步历史邮件
      await this.initialSync();

      // 4. 进入定时轮询（异步，不阻塞 HTTP 启动）
      this.startPollingLoop();
    } catch (error) {
      this.logger.error(
        `IMAP 启动失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.shutdownRequested = true;
    if (this.client) {
      try {
        await this.client.logout();
        this.logger.log('IMAP 已断开');
      } catch { /* 忽略关闭时的错误 */ }
    }
  }

  // -----------------------------------------------------------------------
  // 首次同步 — 将历史邮件全部入库
  // -----------------------------------------------------------------------

  private async initialSync(): Promise<void> {
    if (this.config!.bootstrapMode === 'mark_existing_seen') {
      // 跳过历史邮件，只记录当前最大 UID
      await this.markAllExistingAsSeen();
      return;
    }

    // process_existing：拉取全网箱邮件，与 DB 比对后入库
    this.logger.log('开始同步历史邮件（process_existing 模式）...');

    const lock = await this.client!.getMailboxLock(this.config!.mailbox);
    try {
      // 获取邮箱中所有 UID
      const allUids = await this.fetchAllUids();
      if (allUids.length === 0) {
        this.logger.log('邮箱中没有邮件');
        return;
      }

      // 批量查询已处理的 UID
      const processedUids = await this.getProcessedUids();
      const newUids = allUids
        .filter((uid) => !processedUids.has(uid))
        .sort((a, b) => a - b); // 升序：从旧到新

      if (newUids.length === 0) {
        this.logger.log(`所有 ${allUids.length} 封邮件已入库，无需同步`);
        return;
      }

      this.logger.log(`发现 ${newUids.length} 封新邮件（共 ${allUids.length} 封已有），按时间顺序逐封入库...`);

      let processed = 0;
      for (const uid of newUids) {
        if (this.shutdownRequested) break;
        try {
          await this.processSingleEmail(uid, this.config!.mailbox);
          processed += 1;
          if (processed % 10 === 0 || processed === newUids.length) {
            this.logger.log(`历史邮件同步进度: ${processed}/${newUids.length}`);
          }
        } catch (error) {
          this.logger.error(
            `同步邮件 UID ${uid} 失败: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      this.logger.log(`历史邮件同步完成: ${processed}/${newUids.length} 封入库`);
    } finally {
      lock.release();
      await this.syncService.markBootstrapCompleted(this.mailboxAccountId, this.config!.mailbox);
    }
  }

  /** mark_existing_seen: 不处理历史，仅记录当前最大 UID */
  private async markAllExistingAsSeen(): Promise<void> {
    const lock = await this.client!.getMailboxLock(this.config!.mailbox);
    try {
      const status = await this.client!.status(this.config!.mailbox, { uidNext: true });
      const uidNext = status.uidNext ? Number(status.uidNext) : 0;
      const lastUid = Math.max(0, uidNext - 1);
      const uidValidity = await this.getUidValidity();
      await this.syncService.updateLastSeenUid(
        this.mailboxAccountId, this.config!.mailbox, BigInt(lastUid), uidValidity,
      );
      this.logger.log(`跳过历史邮件: 已标记 UID≤${lastUid} 为已见`);
    } finally {
      lock.release();
      await this.syncService.markBootstrapCompleted(this.mailboxAccountId, this.config!.mailbox);
    }
  }

  // -----------------------------------------------------------------------
  // 定时轮询
  // -----------------------------------------------------------------------

  private startPollingLoop(): void {
    const intervalMs = this.config!.pollIntervalMs;
    this.logger.log(`IMAP 轮询已启动，间隔 ${intervalMs / 1000}s`);

    // 使用 setInterval 异步调度，不阻塞 HTTP 监听
    const timer = setInterval(async () => {
      if (this.shutdownRequested) {
        clearInterval(timer);
        return;
      }
      try {
        await this.pollNewEmails();
      } catch (error) {
        this.logger.error(
          `轮询异常: ${error instanceof Error ? error.message : String(error)}`,
        );
        await this.tryReconnect();
      }
    }, intervalMs);

    // 同时立即执行一次轮询
    setTimeout(() => {
      void this.pollNewEmails().catch(() => {});
    }, 2000);
  }

  private async pollNewEmails(): Promise<void> {
    if (!this.client) return;

    const syncState = await this.syncService.getSyncState(
      this.mailboxAccountId,
      this.config!.mailbox,
    );
    const lastSeenUid = syncState?.lastSeenUid !== null && syncState?.lastSeenUid !== undefined
      ? Number(syncState.lastSeenUid)
      : 0;

    const lock = await this.client.getMailboxLock(this.config!.mailbox);
    try {
      const status = await this.client.status(this.config!.mailbox, { uidNext: true });
      const uidNext = status.uidNext ? Number(status.uidNext) : 0;

      // 无新邮件
      if (uidNext <= lastSeenUid + 1) return;

      // 获取新邮件 UID 列表
      const range = `${lastSeenUid + 1}:*`;
      const newUids: number[] = [];
      for await (const msg of this.client.fetch(range, { uid: true }, { uid: true })) {
        if (typeof msg.uid === 'number') newUids.push(msg.uid);
      }

      newUids.sort((a, b) => a - b); // 升序
      if (newUids.length === 0) {
        this.logger.warn(
          `IMAP reported uidNext=${uidNext} after lastSeenUid=${lastSeenUid}, but no UID-range messages were fetched. Sync cursor was not advanced.`,
        );
        return;
      }

      let lastHandledUid = lastSeenUid;
      for (const uid of newUids) {
        if (this.shutdownRequested) break;
        try {
          await this.processSingleEmail(uid, this.config!.mailbox);
          lastHandledUid = uid;
        } catch (error) {
          this.logger.error(
            `轮询处理 UID ${uid} 失败: ${error instanceof Error ? error.message : String(error)}`,
          );
          break;
        }
      }

      if (lastHandledUid <= lastSeenUid) return;

      // 更新同步进度
      const uidValidity = getStatusUidValidity(status);
      await this.syncService.updateLastSeenUid(
        this.mailboxAccountId,
        this.config!.mailbox,
        BigInt(lastHandledUid),
        uidValidity,
      );
    } finally {
      lock.release();
    }
  }

  // -----------------------------------------------------------------------
  // 单封邮件处理 — 核心流水线
  // -----------------------------------------------------------------------

  private async processSingleEmail(uid: number, mailbox: string): Promise<void> {
    // 1. 幂等检查：processed_emails 表中是否已存在
    const identity = {
      mailboxAccountId: this.mailboxAccountId,
      mailbox,
      uidValidity: (await this.getUidValidity()) ?? undefined,
      uid,
    };

    // 2. 从 IMAP 拉取完整邮件
    const inboundEmail = await this.fetchEmailFromImap(mailbox, uid);

    // 3. 调用 PollEmailInboxUseCase：邮件入库 + 创建/匹配询盘 + AI 分析
    const candidate: PollEmailCandidate = { identity, inboundEmail };
    const result = await this.pollUseCase.processCandidate(candidate);

    if (result.skipped) {
      this.logger.log(`UID ${uid} 已处理，跳过`);
      return;
    }

    const inquiryId = result.inquiryCase?.id ?? 'none';
    const emailId = result.emailMessage?.id ?? 'unknown';
    const status = result.inquiryCase?.status ?? 'none';

    this.logger.log(
      `邮件入库: email=${emailId} inquiry=${inquiryId} status=${status} from=${inboundEmail.fromEmail}`,
    );

    // 4. 输出 AI 分析结果
    if (!result.inquiryCase) {
      if (result.skippedReason === 'own_email_without_matching_inquiry') {
        this.logger.warn(
          `Own outbound/internal email stored without matching inquiry; AI analysis skipped. email=${emailId}`,
        );
      } else {
        this.logger.warn(
          `Email stored without inquiry; AI analysis skipped. reason=${result.skippedReason ?? 'unknown'} email=${emailId}`,
        );
      }
      return;
    }

    if (result.skippedReason) {
      this.logger.log(
        `Email stored as inquiry context; AI analysis skipped. reason=${result.skippedReason} email=${emailId} inquiry=${inquiryId}`,
      );
      return;
    }

    this.logAiResultV2(result.aiAnalysisResult, result.inquiryCase.status);
  }

  // -----------------------------------------------------------------------
  // IMAP 操作
  // -----------------------------------------------------------------------

  private async fetchAllUids(): Promise<number[]> {
    const uids: number[] = [];
    for await (const msg of this.client!.fetch('1:*', { uid: true })) {
      if (typeof msg.uid === 'number') uids.push(msg.uid);
    }
    return uids;
  }

  private async getProcessedUids(): Promise<Set<number>> {
    const uidValidity = await this.getUidValidity();
    const records = await this.prisma.processedEmail.findMany({
      where: {
        mailboxAccountId: this.mailboxAccountId,
        mailboxName: this.config!.mailbox,
        ...(uidValidity ? { uidValidity } : {}),
      },
      select: { uid: true },
    });
    return new Set(records.map((r) => Number(r.uid)));
  }

  private async fetchEmailFromImap(mailbox: string, uid: number): Promise<InboundEmail> {
    const message = await this.client!.fetchOne(
      String(uid),
      { envelope: true, internalDate: true, source: true, uid: true },
      { uid: true },
    );
    if (!message) throw new Error(`IMAP 邮件 UID=${uid} 不存在`);

    const sourceBuffer = toBuffer(message.source);
    const parsed = await simpleParser(sourceBuffer);
    const from = firstAddress(message.envelope?.from);
    if (!from?.address) throw new Error(`邮件 UID=${uid} 没有发件人地址`);

    return {
      messageId: parsed.messageId || `imap:${mailbox}:${message.uid}`,
      threadId: parsed.inReplyTo || parsed.references?.at(0),
      fromEmail: from.address,
      fromName: from.name,
      toEmails: toAddressList(message.envelope?.to),
      ccEmails: toAddressList(message.envelope?.cc),
      subject: message.envelope?.subject || parsed.subject || '(无主题)',
      bodyText: parsed.text,
      bodyHtml: typeof parsed.html === 'string' ? parsed.html : undefined,
      receivedAt: message.internalDate instanceof Date
        ? message.internalDate
        : new Date(message.internalDate || Date.now()),
      source: EmailSource.IMAP,
      raw: formatRawSource(sourceBuffer),
    };
  }

  private async tryReconnect(): Promise<void> {
    try {
      await this.client?.logout();
    } catch { /* ignore */ }
    try {
      this.client = new ImapFlow({
        host: this.config!.host, port: this.config!.port, secure: this.config!.secure,
        auth: { user: this.config!.user, pass: this.config!.pass }, logger: false,
      });
      await this.client.connect();
      this.logger.log('IMAP 重连成功');
    } catch (error) {
      this.logger.error(
        `IMAP 重连失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // -----------------------------------------------------------------------
  // 配置 & 日志
  // -----------------------------------------------------------------------

  private readConfig(): ImapConfig | null {
    const host = process.env.IMAP_HOST;
    const user = process.env.IMAP_USER;
    const pass = process.env.IMAP_PASS;
    if (!host || !user || !pass) return null;

    const mode = process.env.IMAP_POLL_BOOTSTRAP_MODE || 'mark_existing_seen';
    return {
      host,
      port: Number(process.env.IMAP_PORT || 993),
      secure: process.env.IMAP_SECURE !== 'false',
      user,
      pass,
      mailbox: process.env.IMAP_MAILBOX || 'INBOX',
      pollIntervalMs: Number(process.env.IMAP_POLL_INTERVAL_MS || 30000),
      bootstrapMode: (mode === 'mark_existing_seen' ? 'mark_existing_seen' : 'process_existing') as ImapConfig['bootstrapMode'],
    };
  }

  private logAiResultV2(result?: AnalyzeEmailWithAiResult, currentInquiryStatus?: string): void {
    if (!result) return;
    if (result.success) {
      const {
        classification,
        suggestedStatus,
        confidence,
        reason,
        missingFields,
        humanReviewRequired,
        quoteBoundaryDetected,
      } = result.analysis;
      const suspiciousAiSuggestion = suggestedStatus === InquiryStatus.READY_FOR_QUOTE &&
        missingFields.length > 0;

      this.logger.log(
        [
          'AI suggestion only:',
          `currentStatus=${currentInquiryStatus ?? 'unknown'}`,
          `classification=${classification}`,
          `suggestedStatus=${suggestedStatus}`,
          `confidence=${Math.round(confidence * 100)}%`,
          `humanReviewRequired=${humanReviewRequired}`,
          `quoteBoundaryDetected=${quoteBoundaryDetected}`,
          `contextSnapshotId=${result.contextSnapshotId ?? 'none'}`,
          'statusTransitionApplied=false',
        ].join(' '),
      );
      this.logger.log(`AI reason: ${reason}`);
      if (missingFields.length > 0) {
        this.logger.log(`AI missingFields: ${missingFields.join(', ')}`);
      }
      if (suspiciousAiSuggestion) {
        this.logger.warn(
          `Suspicious AI suggestion: suggestedStatus=ready_for_quote but missingFields=${missingFields.join(', ')}`,
        );
      }
    } else {
      this.logger.warn(
        [
          'AI analysis failed:',
          `errorCode=${result.errorCode}`,
          `message=${result.message}`,
          `contextSnapshotId=${result.contextSnapshotId ?? 'none'}`,
          'humanReviewRequired=true',
        ].join(' '),
      );
    }
  }

  private logAiResult(result?: AnalyzeEmailWithAiResult): void {
    if (!result) return;
    if (result.success) {
      const { classification, suggestedStatus, confidence, reason, missingFields } = result.analysis;
      this.logger.log(
        `AI 分析: ${classification} → ${suggestedStatus} (置信度 ${Math.round(confidence * 100)}%)`,
      );
      this.logger.log(`AI 原因: ${reason}`);
      if (missingFields.length > 0) {
        this.logger.log(`缺失字段: ${missingFields.join(', ')}`);
      }
    } else {
      this.logger.warn(`AI 分析失败: [${result.errorCode}] ${result.message}`);
    }
  }

  private async getUidValidity(): Promise<bigint | null> {
    const status = await this.client!.status(this.config!.mailbox, { uidNext: true });
    return getStatusUidValidity(status);
  }
}

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

function toBuffer(source: unknown): Buffer {
  if (!source) return Buffer.alloc(0);
  if (Buffer.isBuffer(source)) return source;
  if (source instanceof Uint8Array) return Buffer.from(source);
  return Buffer.from(String(source), 'utf8');
}

function formatRawSource(source: Buffer): string {
  return `base64:${source.toString('base64')}`;
}

function firstAddress(addresses: { address?: string; name?: string }[] | undefined) {
  return addresses?.find((a) => a.address);
}

function toAddressList(addresses: { address?: string }[] | undefined): string[] {
  return addresses?.map((a) => a.address).filter((a): a is string => Boolean(a)) ?? [];
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function getStatusUidValidity(status: unknown): bigint | null {
  const value = (status as { uidValidity?: number | bigint | string }).uidValidity;
  if (value === undefined || value === null) return null;
  return BigInt(value);
}
