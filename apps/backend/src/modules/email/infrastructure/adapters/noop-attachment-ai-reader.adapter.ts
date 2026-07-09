import {
  AttachmentAiReaderAdapter,
  ReadAttachmentWithAiInput,
  ReadAttachmentWithAiResult,
} from '../../application/ports/attachment-ai-reader.adapter.js';

export class NoopAttachmentAiReaderAdapter implements AttachmentAiReaderAdapter {
  async read(_input: ReadAttachmentWithAiInput): Promise<ReadAttachmentWithAiResult | undefined> {
    return undefined;
  }
}
