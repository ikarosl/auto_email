/**
 * 历史数据审计脚本
 *
 * 用法: pnpm --filter @email-inquiry/backend data:audit
 *
 * 只读不写，生成审计报告到 logs/data-audit.jsonl
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

interface AuditIssue {
  type: string;
  severity: 'low' | 'medium' | 'high';
  inquiryCaseId?: string;
  customerEmail?: string;
  organizationId?: string;
  detail: string;
  suggestion: string;
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function run(): Promise<void> {
  const issues: AuditIssue[] = [];

  // 1. 同企业域名 2 个月内多个打开询盘
  const openInquiries = await prisma.inquiryCase.findMany({
    where: {
      deletedAt: null,
      status: { notIn: ['closed', 'invalid'] },
      customer: { domain: { not: null }, email: { not: { endsWith: '@gmail.com' } } },
    },
    include: { customer: true },
    orderBy: { createdAt: 'desc' },
  });

  const domainGroups = new Map<string, any[]>();
  for (const inquiry of openInquiries) {
    if (!inquiry.customer.domain) continue;
    const group = domainGroups.get(inquiry.customer.domain) ?? [];
    group.push(inquiry);
    domainGroups.set(inquiry.customer.domain, group);
  }

  for (const [domain, group] of domainGroups) {
    if (group.length >= 2) {
      const first = group[0]!;
      const customerIds = new Set(group.map((i: any) => i.customerId));
      issues.push({
        type: 'duplicate_open_inquiries_by_domain',
        severity: 'medium',
        customerEmail: (first.customer as { email?: string })?.email ?? undefined,
        organizationId: first.organizationId ?? undefined,
        detail: `Domain ${domain} has ${group.length} open inquiries across ${customerIds.size} customers`,
        suggestion: 'Consider merging inquiries from the same organization.',
      });
    }
  }

  // 2. 业务主题等于网站表单通用标题
  const formTitleInquiries = await prisma.inquiryCase.findMany({
    where: {
      deletedAt: null,
      status: { not: 'invalid' },
      OR: [
        { businessSubject: { contains: '你有一个网站表单提交的新询盘' } },
      ],
    },
    include: { customer: true },
  });

  for (const inquiry of formTitleInquiries) {
    issues.push({
      type: 'generic_business_subject',
      severity: 'low',
      inquiryCaseId: inquiry.id,
      customerEmail: inquiry.customer.email,
      detail: `Business subject "${inquiry.businessSubject}" appears to be a generic website form title`,
      suggestion: 'AI will auto-generate a proper business subject on next analysis.',
    });
  }

  // 3. customer.status = invalid 但仍有打开询盘
  const invalidCustomersWithOpen = await prisma.customer.findMany({
    where: {
      deletedAt: null,
      status: 'invalid',
      inquiryCases: {
        some: {
          deletedAt: null,
          status: { notIn: ['closed', 'invalid'] },
        },
      },
    },
    include: {
      inquiryCases: {
        where: { deletedAt: null, status: { notIn: ['closed', 'invalid'] } },
      },
    },
  });

  for (const customer of invalidCustomersWithOpen) {
    issues.push({
      type: 'invalid_customer_with_open_inquiries',
      severity: 'high',
      customerEmail: customer.email,
      detail: `Customer "${customer.email}" is marked invalid but has ${customer.inquiryCases.length} open inquiry(ies)`,
      suggestion: 'Review and either re-activate the customer or close the inquiries.',
    });
  }

  // 4. 公共邮箱联系人正文/签名中出现公司域名
  const publicDomainCustomers = await prisma.customer.findMany({
    where: {
      deletedAt: null,
      organizationId: null,
      OR: [
        { email: { endsWith: '@gmail.com' } },
        { email: { endsWith: '@qq.com' } },
        { email: { endsWith: '@outlook.com' } },
        { email: { endsWith: '@hotmail.com' } },
        { email: { endsWith: '@163.com' } },
        { email: { endsWith: '@126.com' } },
      ],
    },
    include: {
      inquiryCases: {
        where: { deletedAt: null },
        take: 3,
        include: {
          inquiryMessages: {
            take: 5,
            include: { emailMessage: true },
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { latestMessageAt: 'desc' },
      },
    },
    take: 100,
  });

  for (const customer of publicDomainCustomers) {
    const bodies = customer.inquiryCases
      .flatMap((ic: any) => ic.inquiryMessages ?? [])
      .map((im: any) => (im.emailMessage as { bodyText?: string })?.bodyText ?? '')
      .filter(Boolean);

    const companyMatches = bodies.flatMap((b: string) => {
      const matches: string[] = [];
      const domainRegex = /[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      let match: RegExpExecArray | null;
      while ((match = domainRegex.exec(b)) !== null) {
        const domain = match[0].toLowerCase();
        if (
          domain !== 'gmail.com' &&
          domain !== 'qq.com' &&
          domain !== 'outlook.com' &&
          domain !== 'hotmail.com' &&
          domain !== '163.com' &&
          domain !== '126.com' &&
          domain !== 'yahoo.com' &&
          domain !== 'hzbeat.com'
        ) {
          matches.push(domain);
        }
      }
      return matches;
    });

    const uniqueDomains = [...new Set(companyMatches)];
    if (uniqueDomains.length > 0) {
      issues.push({
        type: 'public_email_with_company_domain_in_body',
        severity: 'medium',
        customerEmail: customer.email,
        detail: `Public email ${customer.email} mentions company domains in email body: ${uniqueDomains.join(', ')}`,
        suggestion: 'Consider binding this customer to the matching organization.',
      });
    }
  }

  // 5. 没有 business_subject 的询盘
  const noSubject = await prisma.inquiryCase.findMany({
    where: {
      deletedAt: null,
      businessSubject: null,
    },
    include: { customer: true },
    take: 50,
  });

  for (const inquiry of noSubject) {
    issues.push({
      type: 'missing_business_subject',
      severity: 'low',
      inquiryCaseId: inquiry.id,
      customerEmail: inquiry.customer.email,
      detail: `Inquiry ${inquiry.id} has no business subject`,
      suggestion: 'AI will auto-generate on next email analysis.',
    });
  }

  // 输出报告
  const logPath = resolve(process.cwd(), 'logs', `data-audit-${new Date().toISOString().slice(0, 10)}.jsonl`);
  mkdirSync(dirname(logPath), { recursive: true });

  for (const issue of issues) {
    appendFileSync(logPath, `${JSON.stringify(issue)}\n`, 'utf8');
  }

  console.log(`\n=== Data Audit Complete ===`);
  console.log(`Total issues found: ${issues.length}`);
  console.log(`  high:   ${issues.filter((i) => i.severity === 'high').length}`);
  console.log(`  medium: ${issues.filter((i) => i.severity === 'medium').length}`);
  console.log(`  low:    ${issues.filter((i) => i.severity === 'low').length}`);
  console.log(`Report written to: ${logPath}`);

  await prisma.$disconnect();
}

run().catch((error) => {
  console.error('Audit failed:', error);
  process.exit(1);
});
