/**
 * Type definitions for Relay Chat API
 */

export interface User {
  id: string;
  username: string;
  displayName: string;
  nostrPubkey: string;
  role: 'admin' | 'member';
}

export interface UploadResult {
  url: string;
  sha256: string;
  size: number;
  mimeType: string;
  filename: string;
}

/**
 * Extended attachment interface with upload state
 * Used in UI components during file upload
 */
export interface Attachment extends UploadResult {
  uploading?: boolean;
  uploadProgress?: number;
  error?: string;
}

export interface Message {
  id: string;
  channelId: string;
  author: {
    id: string;
    username: string;
    displayName: string;
    nostrPubkey: string;
  };
  content: string;
  attachments: UploadResult[];  // Fixed from any[]
  reactions: Record<string, string[]>;
  threadCount: number;
  createdAt: string;
  editedAt: string | null;
}

export interface Channel {
  id: string;
  name: string;
  description: string;
  memberCount: number;
}

export interface Invite {
  code: string;
  createdAt: string;
  createdBy: string;
  useCount: number;
  maxUses: number | null;
  expiresAt: string | null;
}

export interface ThreadResponse {
  root: Message;
  replies: Message[];
}

// API Response wrappers for type safety
export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface SignupResponse {
  token: string;
  user: User;
}

export interface HasUsersResponse {
  hasUsers: boolean;
}
