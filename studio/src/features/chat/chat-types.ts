export interface ChatGuest {
  id: string;
  nickname: string;
  avatarSeed: string;
}
export interface ChatSession {
  guest: ChatGuest;
  expiresAt: string;
}
export interface ChatParticipant extends ChatGuest {
  online: boolean;
}
export interface ChatMentionRequest {
  guestId: string;
  start: number;
  length: number;
}
export interface ChatMention extends ChatMentionRequest {
  nickname: string;
}
export interface ChatReply {
  id: string;
  nickname: string;
  content: string;
  deleted: boolean;
  unavailable: boolean;
  revision: number;
}
export interface ChatMessageContext {
  items: ChatMessage[];
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
}
export interface ChatMessage {
  id: string;
  clientMessageId: string;
  guestId: string;
  nickname: string;
  avatarSeed: string;
  content: string;
  createdAt: string;
  deleted: boolean;
  revision: number;
  reply: ChatReply | null;
  mentions: ChatMention[];
}
export interface ChatMessagePage {
  items: ChatMessage[];
  hasMore: boolean;
  nextCursor: string | null;
}
export interface ChatAck {
  reply: ChatReply | null;
  mentions: ChatMention[];
  id: string;
  clientMessageId: string;
  createdAt: string;
}
export interface ChatStatus {
  onlineUsers: number;
  serverTime: string;
  messageCleanupEnabled: boolean;
  retentionDays: number;
  maxMessageChars: number;
  maxMessageBytes: number;
}
export type ConnectionStatus =
  'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
