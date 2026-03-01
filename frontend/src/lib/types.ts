export interface User {
  id: number;
  username: string;
  displayName: string;
  role: 'admin' | 'member';
  isBot?: boolean;
  avatarUrl?: string;
}

export interface Channel {
  id: number;
  name: string;
  unreadCount?: number;
  hasMention?: boolean;
}

export interface Message {
  id: number;
  channelId: number;
  userId?: number;
  parentId?: number | null;
  content: string;
  createdAt: string;
  username?: string;
  displayName: string;
  replyCount?: number;
  isBot?: boolean;
  avatarUrl?: string;
  mentions?: string[];
  reactions?: Reaction[];
  linkPreviews?: LinkPreview[];
  files?: FileAttachment[];
  editedAt?: string | null;
  deletedAt?: string | null;
}

export interface Reaction {
  emoji: string;
  count: number;
  userIds: number[];
}

export interface LinkPreview {
  url: string;
  title?: string;
  description?: string;
  image?: string;
}

export interface ThreadSummary {
  parentId: number;
  channelId: number;
  channelName: string;
  authorDisplayName: string;
  contentPreview: string;
  replyCount: number;
  lastActivityAt: string;
  authorIsBot?: boolean;
}

export interface NotificationSettings {
  userId: number;
  provider?: string;
  providerConfig?: string;
  notifyMentions: boolean;
  notifyThreadReplies: boolean;
  notifyAllMessages: boolean;
  configured: boolean;
}

export interface Bot {
  id: number;
  username: string;
  displayName: string;
}

export interface BotToken {
  id: number;
  label?: string;
  token?: string;
  revokedAt?: string | null;
}

export interface ChannelBinding {
  channelId: number;
  channelName?: string;
  canRead: boolean;
  canWrite: boolean;
}

export interface FileAttachment {
  id: number;
  messageId?: number;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploaderId: number;
  createdAt: string;
}

export interface Invite {
  code: string;
  useCount: number;
  maxUses?: number | null;
}

export interface SearchResult {
  id: number;
  channelId: number;
  channelName: string;
  userId: number;
  username: string;
  displayName: string;
  content: string;
  createdAt: string;
  parentId?: number;
}
