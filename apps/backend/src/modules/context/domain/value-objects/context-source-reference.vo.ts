import { ContextSourceType } from '../enums/context-source-type.enum.js';

export interface ContextSourceReference {
  sourceType: ContextSourceType;
  sourceId?: string;
  emailMessageId?: string;
  label?: string;
}
