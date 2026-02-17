// Configuration types
export interface AccountConfig {
  enabled: boolean;
  url: string;           // WebSocket URL (e.g., ws://localhost:8080/ws)
  apiBase: string;       // API base URL (e.g., http://localhost:8080)
  token: string;         // Bot token from admin panel
  username: string;      // Bot username for @mention matching
}

export interface ChannelConfig {
  accounts: Record<string, AccountConfig>;
}

export interface PluginConfig {
  channels?: {
    relaychat?: ChannelConfig;
  };
}

// Relay-Chat message types (matching relay-chat's WebSocket events)
export interface RelayMessage {
  id: number;
  channelId: number;
  userId: number;
  parentId: number | null;
  content: string;
  username: string;
  displayName: string;
  isBot: boolean;
  mentions: string[];
  createdAt: string;
}

export interface WebSocketEvent {
  type: 'connected' | 'new_message' | 'new_reply' | 'reaction_added' | 'reaction_removed' | 'channel_created';
  payload?: any;
}

// Session mapping
export interface SessionInfo {
  accountId: string;
  channelId: number;
  threadId: number;      // Parent message ID
  messageId: number;     // Original message that started the thread
}

// OpenClaw plugin API types (minimal definitions based on docs)
export interface PluginAPI {
  logger: {
    info(message: string): void;
    error(message: string, error?: any): void;
    warn(message: string): void;
    debug(message: string): void;
  };
  registerChannel(config: { plugin: ChannelPlugin }): void;
}

export interface ChannelPlugin {
  id: string;
  meta: {
    id: string;
    label: string;
    selectionLabel: string;
    blurb: string;
  };
  capabilities: {
    chatTypes: string[];
  };
  config: {
    listAccountIds(cfg: PluginConfig): string[];
    resolveAccount(cfg: PluginConfig, accountId?: string): AccountConfig;
  };
  outbound: {
    deliveryMode: 'direct';
    sendText(params: { text: string; sessionId: string }): Promise<{ ok: boolean; error?: string }>;
  };
}

// Internal types
export interface MessageHandler {
  (message: RelayMessage): void | Promise<void>;
}
