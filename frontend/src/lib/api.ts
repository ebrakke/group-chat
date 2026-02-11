const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export interface User {
  id: string;
  username: string;
  displayName: string;
  nostrPubkey: string;
  role: 'admin' | 'member';
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
  attachments: any[];
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

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : '',
  };
}

export async function fetchChannels(): Promise<Channel[]> {
  const response = await fetch(`${API_URL}/api/v1/channels`, {
    headers: getAuthHeaders(),
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch channels');
  }
  
  return response.json();
}

export async function fetchMessages(channelId: string, limit: number = 50, before?: string): Promise<Message[]> {
  const params = new URLSearchParams({ limit: limit.toString() });
  if (before) {
    params.append('before', before);
  }
  
  const response = await fetch(`${API_URL}/api/v1/channels/${channelId}/messages?${params}`, {
    headers: getAuthHeaders(),
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch messages');
  }
  
  return response.json();
}

export async function sendMessage(channelId: string, content: string, attachments?: any[]): Promise<Message> {
  const response = await fetch(`${API_URL}/api/v1/channels/${channelId}/messages`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ content, attachments }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to send message');
  }
  
  return response.json();
}

export async function editMessage(messageId: string, content: string): Promise<Message> {
  const response = await fetch(`${API_URL}/api/v1/messages/${messageId}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify({ content }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to edit message');
  }
  
  return response.json();
}

export async function deleteMessage(messageId: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/v1/messages/${messageId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete message');
  }
}

export async function fetchCurrentUser(): Promise<User> {
  const response = await fetch(`${API_URL}/api/v1/auth/me`, {
    headers: getAuthHeaders(),
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch user');
  }
  
  return response.json();
}

export async function checkHasUsers(): Promise<boolean> {
  const response = await fetch(`${API_URL}/api/v1/auth/has-users`);
  
  if (!response.ok) {
    // If the API call fails, default to assuming users exist (safer - shows login)
    console.error('Failed to check if users exist, defaulting to showing login');
    return true;
  }
  
  const data = await response.json();
  return data.hasUsers;
}

// Thread API

export interface ThreadResponse {
  root: Message;
  replies: Message[];
}

export async function fetchThread(messageId: string): Promise<ThreadResponse> {
  const response = await fetch(`${API_URL}/api/v1/messages/${messageId}/thread`, {
    headers: getAuthHeaders(),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch thread');
  }
  
  return response.json();
}

export async function replyInThread(messageId: string, content: string, alsoSendToChannel?: boolean): Promise<Message> {
  const response = await fetch(`${API_URL}/api/v1/messages/${messageId}/thread`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ content, alsoSendToChannel }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to reply in thread');
  }
  
  return response.json();
}

// Reaction API

export async function addReaction(messageId: string, emoji: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/v1/messages/${messageId}/reactions`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ emoji }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to add reaction');
  }
}

export async function removeReaction(messageId: string, emoji: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/v1/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to remove reaction');
  }
}
