/**
 * 邮件中转服务提取器
 *
 * 某些询盘邮件通过第三方中转服务发送（如 tatasoft.com 的网站留言表单），
 * 其 Envelope From 为中转服务邮箱而非客户真实邮箱。
 * 客户真实信息在正文中以结构化字段呈现：
 *
 *   联系人:
 *   联系邮箱:REAL@CUSTOMER.COM
 *   联系电话:
 *   留言内容:...
 *
 * 本模块负责：
 *  1. 检测发件域名是否为已知中转服务
 *  2. 从正文提取真实客户邮箱和姓名
 */

const RELAY_DOMAINS = new Set([
  'tatasoft.com',
]);

/**
 * 联系人表单结构化字段的正则。
 * 兼容紧凑格式（字段间无换行）和宽松格式（字段间有换行/空格）。
 *
 * 捕获组：
 *  - contactPerson: 联系人姓名（可能为空）
 *  - contactEmail:  联系邮箱（必填）
 *  - contactPhone:  联系电话（可能为空）
 *  - message:       留言内容（正文剩余部分）
 */
const CONTACT_FIELDS_PATTERN =
  /联系人\s*[:：]\s*(?<contactPerson>[\s\S]*?)联系邮箱\s*[:：]\s*(?<contactEmail>[^\s:：]+)\s*联系电话\s*[:：]\s*(?<contactPhone>[\s\S]*?)留言内容\s*[:：]\s*(?<message>[\s\S]*)/;

export interface ExtractedContactInfo {
  /** 客户真实邮箱（已转小写） */
  email: string;
  /** 客户姓名（可选） */
  name?: string;
}

/**
 * 判断发件邮箱是否来自已知中转服务域名。
 */
export function isRelayDomain(fromEmail: string): boolean {
  const domain = extractDomain(fromEmail);
  if (!domain) return false;

  // 精确匹配域名或其子域名（如 mail.tatasoft.com → tatasoft.com）
  return RELAY_DOMAINS.has(domain) || [...RELAY_DOMAINS].some((relay) => domain.endsWith(`.${relay}`));
}

/**
 * 从邮件正文中提取结构化联系人信息。
 *
 * @param bodyText 邮件原文（未清洗的原始 bodyText，含结构化字段标记）
 * @returns 提取到的联系人信息，若未匹配结构化字段则返回 null
 */
export function extractContactInfoFromBody(bodyText?: string): ExtractedContactInfo | null {
  if (!bodyText) {
    return null;
  }

  const match = bodyText.match(CONTACT_FIELDS_PATTERN);
  if (!match?.groups?.contactEmail?.trim()) {
    return null;
  }

  const email = match.groups.contactEmail.trim().toLowerCase();
  const name = match.groups.contactPerson?.trim() || undefined;

  return { email, name };
}

function extractDomain(email: string): string | undefined {
  const atIndex = email.indexOf('@');
  if (atIndex < 0) {
    return undefined;
  }

  return email.slice(atIndex + 1).trim().toLowerCase() || undefined;
}
