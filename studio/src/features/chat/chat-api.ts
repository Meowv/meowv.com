import type {
  ChatParticipant,
  ChatMessageContext,
  ChatMessagePage,
  ChatSession,
  ChatStatus,
} from './chat-types';

export class ChatApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function chatRequest<T>(
  path: string,
  signal: AbortSignal,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api/chat${path}`, {
    ...options,
    signal,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'X-Chat-Request': '1', ...options.headers },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new ChatApiError(
      response.status,
      error?.code ?? 'request_failed',
      error?.message ??
        (response.status === 429 ? '操作太快，请稍后重试。' : '聊天室暂不可用，请稍后重试。'),
    );
  }
  return response.status === 204 || response.status === 202 ? (undefined as T) : response.json();
}
export const chatApi = {
  session: (signal: AbortSignal) => chatRequest<ChatSession>('/session', signal),
  join: (nickname: string, signal: AbortSignal) =>
    chatRequest<ChatSession>('/session', signal, {
      method: 'POST',
      body: JSON.stringify({ nickname }),
    }),
  logout: (signal: AbortSignal) => chatRequest<void>('/session', signal, { method: 'DELETE' }),
  history: (
    signal: AbortSignal,
    cursor?: { beforeId?: string; afterId?: string; limit?: string },
  ) => chatRequest<ChatMessagePage>(`/messages?${new URLSearchParams(cursor)}`, signal),
  context: (id: string, signal: AbortSignal) =>
    chatRequest<ChatMessageContext>(`/messages/${encodeURIComponent(id)}/context`, signal),
  participants: (signal: AbortSignal) => chatRequest<ChatParticipant[]>('/participants', signal),
  status: (signal: AbortSignal) => chatRequest<ChatStatus>('/status', signal),
};
