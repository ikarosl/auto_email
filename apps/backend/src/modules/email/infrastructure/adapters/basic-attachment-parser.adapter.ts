import {
  AttachmentParserAdapter,
  AttachmentParserResult,
  ParseAttachmentInput,
} from '../../application/ports/attachment-parser.adapter.js';
import { AttachmentAiReaderAdapter } from '../../application/ports/attachment-ai-reader.adapter.js';

type PdfParse = (dataBuffer: Buffer) => Promise<{ text?: string }>;

export class BasicAttachmentParserAdapter implements AttachmentParserAdapter {
  constructor(private readonly aiReaderAdapter?: AttachmentAiReaderAdapter) {}

  async parse(input: ParseAttachmentInput): Promise<AttachmentParserResult> {
    const mimeType = input.mimeType.toLowerCase();
    const fileName = input.fileName.toLowerCase();

    if (mimeType === 'application/pdf' || fileName.endsWith('.pdf')) {
      return this.parsePdf(input);
    }

    if (
      mimeType.startsWith('text/')
      || fileName.endsWith('.txt')
      || fileName.endsWith('.csv')
    ) {
      return parsePlainText(input.content);
    }

    return {
      parseStatus: 'skipped',
      parseErrorCode: 'unsupported_mime_type',
      parseErrorMessage: `Unsupported attachment MIME type: ${input.mimeType}`,
      isContextCandidate: false,
      ocr: { status: shouldReserveOcr(mimeType, fileName) ? 'pending' : 'skipped' },
    };
  }

  private async parsePdf(input: ParseAttachmentInput): Promise<AttachmentParserResult> {
    let pdfParse: PdfParse;
    try {
      const module = await import('pdf-parse');
      pdfParse = (module.default ?? module) as PdfParse;
    } catch (error) {
      return this.readPdfWithAi(input, {
        parseStatus: 'failed',
        parseStrategy: 'pdf_text',
        parseErrorCode: 'missing_pdf_parser',
        parseErrorMessage: error instanceof Error ? error.message : String(error),
        isContextCandidate: true,
        ocr: { status: 'pending' },
      });
    }

    try {
      const parsed = await pdfParse(input.content);
      const text = normalizeParsedText(parsed.text);
      if (!text) {
        return this.readPdfWithAi(input, {
          parseStatus: 'failed',
          parseStrategy: 'pdf_text',
          parseErrorCode: 'empty_pdf_text',
          parseErrorMessage: 'PDF text extraction returned empty text; OCR is required.',
          isContextCandidate: true,
          ocr: { status: 'pending' },
        });
      }

      return {
        parseStatus: 'parsed',
        parseStrategy: 'pdf_text',
        parsedText: limitContextText(text),
        parsedTextPreview: createPreview(text),
        isContextCandidate: true,
        ocr: { status: 'skipped' },
      };
    } catch (error) {
      return this.readPdfWithAi(input, {
        parseStatus: 'failed',
        parseStrategy: 'pdf_text',
        parseErrorCode: detectPdfErrorCode(error),
        parseErrorMessage: error instanceof Error ? error.message : String(error),
        isContextCandidate: true,
        ocr: { status: 'pending' },
      });
    }
  }

  private async readPdfWithAi(
    input: ParseAttachmentInput,
    fallback: AttachmentParserResult,
  ): Promise<AttachmentParserResult> {
    if (!isAiReaderEnabled() || !this.aiReaderAdapter) {
      return fallback;
    }

    const result = await this.aiReaderAdapter.read({
      attachmentId: input.attachmentId,
      fileName: input.fileName,
      mimeType: input.mimeType,
      content: input.content,
      prompt: getAiReaderPrompt(),
    });

    const text = normalizeParsedText(result?.text);
    if (!result || !text) {
      return fallback;
    }

    return {
      parseStatus: 'parsed',
      parseStrategy: 'ai_pdf_reader',
      parsedText: limitContextText(text),
      parsedTextPreview: createPreview(text),
      isContextCandidate: true,
      ocr: {
        status: 'parsed',
        provider: result.provider,
        text: limitContextText(text),
        textPreview: createPreview(text),
        resultJson: result.resultJson,
      },
    };
  }
}

function parsePlainText(content: Buffer): AttachmentParserResult {
  const text = normalizeParsedText(content.toString('utf8'));
  if (!text) {
    return {
      parseStatus: 'failed',
      parseStrategy: 'plain_text',
      parseErrorCode: 'empty_attachment',
      parseErrorMessage: 'Text attachment is empty.',
      isContextCandidate: false,
      ocr: { status: 'skipped' },
    };
  }

  return {
    parseStatus: 'parsed',
    parseStrategy: 'plain_text',
    parsedText: limitContextText(text),
    parsedTextPreview: createPreview(text),
    isContextCandidate: true,
    ocr: { status: 'skipped' },
  };
}

function normalizeParsedText(text: string | undefined): string {
  return (text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function createPreview(text: string): string {
  const previewLength = Number(process.env.ATTACHMENT_PREVIEW_MAX_CHARS || 1000);
  return text.slice(0, Math.max(100, previewLength));
}

function limitContextText(text: string): string {
  const maxChars = Number(process.env.ATTACHMENT_CONTEXT_MAX_CHARS || 8000);
  return text.slice(0, Math.max(500, maxChars));
}

function shouldReserveOcr(mimeType: string, fileName: string): boolean {
  return mimeType.startsWith('image/') || fileName.endsWith('.pdf');
}

function detectPdfErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes('password') || message.includes('encrypt')) {
    return 'encrypted_pdf';
  }
  return 'parse_exception';
}

function isAiReaderEnabled(): boolean {
  return ['1', 'true', 'yes', 'on'].includes(
    (process.env.ATTACHMENT_AI_READER_ENABLED || 'false').toLowerCase(),
  );
}

function getAiReaderPrompt(): string {
  return process.env.ATTACHMENT_AI_READER_PROMPT?.trim() || [
    'Extract readable business and technical text from this PDF attachment.',
    'Preserve product model, frequency, power, quantity, size, connector, price, delivery, payment, and contract terms.',
    'If tables exist, convert them into concise markdown-like plain text.',
    'Return plain text only. Do not add conclusions that are not present in the file.',
  ].join('\n');
}
