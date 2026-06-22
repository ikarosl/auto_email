import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { cwd, env, exit } from 'node:process';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';
import OpenAI from 'openai';
import type { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';

type DeepSeekChatCompletionCreateParams = ChatCompletionCreateParamsNonStreaming & {
  thinking?: {
    type: 'enabled' | 'disabled';
  };
};

function loadEnvFiles(): void {
  const currentFile = fileURLToPath(import.meta.url);
  const candidateRoots = [cwd()];
  let currentDir = dirname(currentFile);

  for (let i = 0; i < 8; i += 1) {
    candidateRoots.push(currentDir);
    currentDir = join(currentDir, '..');
  }

  for (const root of candidateRoots) {
    const envPath = join(root, '.env');
    if (existsSync(envPath)) {
      loadDotenv({ path: envPath, override: false });
    }
  }
}

function isThinkingEnabled(): boolean {
  return ['1', 'true', 'yes', 'on'].includes((env.DEEPSEEK_THINKING_ENABLED ?? 'true').toLowerCase());
}

function getReasoningEffort(): 'minimal' | 'low' | 'medium' | 'high' {
  const value = env.DEEPSEEK_REASONING_EFFORT || 'high';
  if (value === 'minimal' || value === 'low' || value === 'medium' || value === 'high') {
    return value;
  }

  return 'high';
}

async function run(): Promise<void> {
  loadEnvFiles();

  if (!env.DEEPSEEK_API_KEY) {
    throw new Error('Missing required DeepSeek config: DEEPSEEK_API_KEY');
  }

  const openai = new OpenAI({
    baseURL: env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    apiKey: env.DEEPSEEK_API_KEY,
  });

  const request: DeepSeekChatCompletionCreateParams = {
    messages: [{ role: 'system', content: 'You are a helpful assistant.' }],
    model: env.DEEPSEEK_MODEL || 'deepseek-v4-pro',
    thinking: { type: isThinkingEnabled() ? 'enabled' : 'disabled' },
    reasoning_effort: getReasoningEffort(),
    stream: false,
  };

  const completion = await openai.chat.completions.create(request);

  console.log(completion.choices[0]?.message?.content ?? '');
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`DeepSeek demo failed: ${message}`);
  exit(1);
});
