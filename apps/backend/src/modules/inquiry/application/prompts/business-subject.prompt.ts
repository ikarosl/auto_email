export const BUSINESS_SUBJECT_SYSTEM_PROMPT = [
  'You generate concise business subjects for RF/microwave product inquiry cases.',
  'Return only JSON.',
  'Do not include customer private data unless required.',
  'Do not infer unsupported product details.',
  'The subject should describe the actual business need, not the email transport title.',
  '',
  'Output schema:',
  JSON.stringify({
    businessSubject: 'string — concise subject, max 200 chars, e.g. "12-15GHz microstrip isolator inquiry"',
    confidence: 'number between 0 and 1',
    reason: 'string — short explanation of how the subject was derived',
  }, null, 2),
].join('\n');
