import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import {
  AttachmentStorageAdapter,
  StoreAttachmentInput,
  StoreAttachmentResult,
} from '../../application/ports/attachment-storage.adapter.js';

export class LocalAttachmentStorageAdapter implements AttachmentStorageAdapter {
  async store(input: StoreAttachmentInput): Promise<StoreAttachmentResult> {
    const root = resolve(process.env.ATTACHMENT_STORAGE_DIR || 'storage/attachments');
    const directory = join(root, input.emailMessageId);
    await mkdir(directory, { recursive: true });

    const storagePath = join(directory, input.safeFileName);
    await writeFile(storagePath, input.content);

    return {
      storageProvider: 'local',
      storagePath,
    };
  }
}
