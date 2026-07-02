import { EmailMessageRepository } from '../../../email/application/ports/email-message.repository.js';
import { EmailMessage } from '../../../email/domain/entities/email-message.entity.js';
import { EmailDirection } from '../../../email/domain/enums/email-direction.enum.js';
import { InquiryRepository } from '../ports/inquiry.repository.js';
import { InquiryMessageRepository } from '../ports/inquiry-message.repository.js';
import { INQUIRY_MATCHING_POLICY } from '../../domain/matching/inquiry-matching-policy.js';
import {
  InquiryMatchingReason,
  InquiryMatchingResult,
} from '../../domain/matching/inquiry-matching-result.js';

export class FindInquiryForInboundEmailUseCase {
  constructor(
    private readonly inquiryRepository: InquiryRepository,
    private readonly inquiryMessageRepository: InquiryMessageRepository,
    private readonly emailMessageRepository: EmailMessageRepository,
  ) {}

  async execute(emailMessage: EmailMessage): Promise<InquiryMatchingResult> {
    const threadMatch = await this.findByThreadId(emailMessage);
    if (threadMatch) {
      return {
        matched: true,
        reason: InquiryMatchingReason.THREAD_ID_MATCH,
        inquiryCase: threadMatch,
        manualReviewRequired: false,
      };
    }

    const participantEmails = resolveCustomerCandidateEmails(emailMessage);
    const openInquiriesNested = await Promise.all(
      participantEmails.map((email) => this.inquiryRepository.listOpenByCustomerEmail(email)),
    );
    const openInquiries = uniqueInquiries(openInquiriesNested.flat());
    const recentOpenInquiries = openInquiries.filter((inquiryCase) =>
      isWithinRecentWindow(inquiryCase.updatedAt),
    );

    if (recentOpenInquiries.length === 1) {
      return {
        matched: true,
        reason: InquiryMatchingReason.SAME_CUSTOMER_RECENT_OPEN_INQUIRY,
        inquiryCase: recentOpenInquiries[0],
        manualReviewRequired: false,
      };
    }

    if (recentOpenInquiries.length > 1) {
      return {
        matched: false,
        reason: InquiryMatchingReason.MULTIPLE_OPEN_INQUIRIES,
        manualReviewRequired: true,
      };
    }

    return {
      matched: false,
      reason: InquiryMatchingReason.NO_MATCH,
      manualReviewRequired: false,
    };
  }

  private async findByThreadId(emailMessage: EmailMessage) {
    const threadId = emailMessage.emailThreadId ?? emailMessage.threadId;
    if (!threadId) {
      return undefined;
    }

    const threadEmails = await this.emailMessageRepository.listByThreadId(threadId);
    for (const threadEmail of threadEmails) {
      if (threadEmail.id === emailMessage.id) {
        continue;
      }

      const inquiryMessage = await this.inquiryMessageRepository.findByEmailMessageId(threadEmail.id);
      if (!inquiryMessage) {
        continue;
      }

      const inquiryCase = await this.inquiryRepository.findById(inquiryMessage.inquiryCaseId);
      if (inquiryCase) {
        return inquiryCase;
      }
    }

    return undefined;
  }
}

function resolveCustomerCandidateEmails(emailMessage: EmailMessage): string[] {
  if (emailMessage.direction === EmailDirection.OUTBOUND) {
    return [...emailMessage.toEmails, ...emailMessage.ccEmails]
      .filter((email) => !isOwnEmail(email));
  }

  return [emailMessage.fromEmail];
}

function uniqueInquiries<T extends { id: string }>(inquiries: T[]): T[] {
  const seen = new Set<string>();
  return inquiries.filter((inquiry) => {
    if (seen.has(inquiry.id)) {
      return false;
    }
    seen.add(inquiry.id);
    return true;
  });
}

function isOwnEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) {
    return false;
  }

  return (process.env.OUR_EMAIL_DOMAINS ?? 'hzbeat.com')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .some((ownDomain) => domain === ownDomain || domain.endsWith(`.${ownDomain}`));
}

function isWithinRecentWindow(updatedAt: Date): boolean {
  const windowMs = INQUIRY_MATCHING_POLICY.recentOpenInquiryWindowDays * 24 * 60 * 60 * 1000;
  return Date.now() - updatedAt.getTime() <= windowMs;
}
