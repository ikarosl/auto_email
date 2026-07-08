import { get_encoding, TiktokenEncoding } from 'tiktoken';

import { TokenEstimator } from '../../application/ports/token-estimator.js';
import { AiChatMessage } from '../../domain/value-objects/ai-chat-message.vo.js';

export class TiktokenTokenEstimator implements TokenEstimator {
  private readonly encoding: ReturnType<typeof get_encoding>;

  constructor(encodingName = process.env.AI_TOKEN_ENCODING || 'cl100k_base') {
    this.encoding = get_encoding(toTiktokenEncoding(encodingName));
  }

  estimateMessages(messages: AiChatMessage[]): number {
    return messages.reduce((total, message) => {
      return total + this.estimateText(message.role) + this.estimateText(message.content) + 4;
    }, 0);
  }

  estimateText(text: string): number {
    return this.encoding.encode(text).length;
  }
}

function toTiktokenEncoding(value: string): TiktokenEncoding {
  if (value === 'gpt2' || value === 'r50k_base' || value === 'p50k_base'
    || value === 'p50k_edit' || value === 'cl100k_base' || value === 'o200k_base') {
    return value;
  }

  return 'cl100k_base';
}
