export interface ModelConfig {
  protocol: 'openai' | 'anthropic';
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  draft: string;
}

export type MessageStatus = 'pending' | 'complete' | 'failed' | 'cancelled' | 'interrupted';

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  status: MessageStatus;
  error?: string;
}

export type ModelMessage = Pick<Message, 'role' | 'content'>;

export function newId(): string {
  return crypto.randomUUID();
}

export function newConversation(): Conversation {
  const now = Date.now();
  return { id: newId(), title: '新对话', createdAt: now, updatedAt: now, draft: '' };
}

export function conversationTitle(text: string): string {
  return Array.from(text.trim().replace(/\s+/g, ' ')).slice(0, 24).join('');
}

export function modelHistory(messages: Message[], pendingId: string): ModelMessage[] {
  return messages
    .filter((message) => message.status === 'complete' || message.id === pendingId)
    .map(({ role, content }) => ({ role, content }));
}
