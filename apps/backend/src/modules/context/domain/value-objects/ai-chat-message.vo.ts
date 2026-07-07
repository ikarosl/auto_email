export type AiChatRole = 'system' | 'user' | 'assistant';

export interface AiChatMessage {
  role: AiChatRole;
  content: string;
}
