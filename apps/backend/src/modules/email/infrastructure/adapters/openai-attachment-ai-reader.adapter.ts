import OpenAI from 'openai';

import {
  AttachmentAiReaderAdapter,
  ReadAttachmentWithAiInput,
  ReadAttachmentWithAiResult,
} from '../../application/ports/attachment-ai-reader.adapter.js';

export class OpenAiAttachmentAiReaderAdapter implements AttachmentAiReaderAdapter {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.ATTACHMENT_AI_READER_API_KEY || process.env.OPENAI_API_KEY,
      baseURL: process.env.ATTACHMENT_AI_READER_BASE_URL || process.env.OPENAI_BASE_URL,
    });
    this.model = process.env.ATTACHMENT_AI_READER_MODEL || 'gpt-4o';
  }

  async read(input: ReadAttachmentWithAiInput): Promise<ReadAttachmentWithAiResult | undefined> {
    const response = await (this.client.responses.create as any)({
      model: this.model,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_file',
              filename: input.fileName || 'attachment.pdf',
              file_data: `data:${input.mimeType};base64,${input.content.toString('base64')}`,
            },
            {
              type: 'input_text',
              text: input.prompt,
            },
          ],
        },
      ],
    });

    const text = typeof response.output_text === 'string'
      ? response.output_text
      : extractOutputText(response);

    return text
      ? {
          provider: 'openai',
          text,
          resultJson: {
            id: response.id,
            model: response.model,
            usage: response.usage,
          },
        }
      : undefined;
  }
}

function extractOutputText(response: any): string {
  const chunks: string[] = [];
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === 'string') {
        chunks.push(content.text);
      }
    }
  }
  return chunks.join('\n').trim();
}
