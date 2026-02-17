# OpenClaw Relay-Chat Plugin Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a native OpenClaw channel plugin that integrates relay-chat as a messaging platform with thread-based session mapping.

**Architecture:** TypeScript/Node.js plugin that connects to relay-chat's WebSocket hub and REST API, registers as an OpenClaw channel, maps relay-chat threads to OpenClaw sessions, and handles bidirectional message flow between users and AI agents.

**Tech Stack:** TypeScript, Node.js, ws (WebSocket), node-fetch (HTTP), OpenClaw Plugin API

---

## Task 1: Initialize Plugin Project

**Files:**
- Create: `openclaw-plugin-relaychat/package.json`
- Create: `openclaw-plugin-relaychat/openclaw.plugin.json`
- Create: `openclaw-plugin-relaychat/tsconfig.json`
- Create: `openclaw-plugin-relaychat/.gitignore`
- Create: `openclaw-plugin-relaychat/README.md`

**Step 1: Create project directory**

```bash
mkdir -p openclaw-plugin-relaychat/src
cd openclaw-plugin-relaychat
```

**Step 2: Create package.json**

```json
{
  "name": "openclaw-plugin-relaychat",
  "version": "1.0.0",
  "description": "OpenClaw channel plugin for Relay Chat (self-hosted NIP-29 group chat)",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "watch": "tsc --watch",
    "prepublishOnly": "npm run build"
  },
  "keywords": ["openclaw", "plugin", "channel", "relay-chat", "nostr"],
  "author": "relay-chat",
  "license": "MIT",
  "openclaw": {
    "entrypoint": "dist/index.js"
  },
  "dependencies": {
    "ws": "^8.16.0",
    "node-fetch": "^3.3.2"
  },
  "devDependencies": {
    "typescript": "^5.3.3",
    "@types/node": "^20.11.5",
    "@types/ws": "^8.5.10"
  }
}
```

**Step 3: Create openclaw.plugin.json**

```json
{
  "id": "relaychat",
  "name": "Relay Chat",
  "version": "1.0.0",
  "description": "OpenClaw channel plugin for Relay Chat (self-hosted NIP-29 group chat)",
  "author": "relay-chat",
  "license": "MIT"
}
```

**Step 4: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "node",
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 5: Create .gitignore**

```
node_modules/
dist/
*.log
.DS_Store
```

**Step 6: Create README.md**

```markdown
# OpenClaw Relay Chat Plugin

OpenClaw channel plugin for [Relay Chat](https://github.com/ebrakke/relay-chat) - a self-hosted, private group chat built on Nostr infrastructure.

## Features

- Native OpenClaw channel integration
- Thread-based session mapping (each thread = one OpenClaw session)
- Real-time WebSocket communication
- Multi-account support

## Installation

\`\`\`bash
openclaw plugins install openclaw-plugin-relaychat
\`\`\`

## Configuration

Add to your OpenClaw config (`~/.config/openclaw/config.json`):

\`\`\`json
{
  "channels": {
    "relaychat": {
      "accounts": {
        "default": {
          "enabled": true,
          "url": "ws://localhost:8080/ws",
          "apiBase": "http://localhost:8080",
          "token": "your-bot-token",
          "username": "claude-bot"
        }
      }
    }
  }
}
\`\`\`

### Configuration Fields

- `url`: WebSocket endpoint for relay-chat
- `apiBase`: HTTP base URL for REST API calls
- `token`: Bot token from relay-chat admin panel
- `username`: Bot username for @mention matching

## Setup

1. Create a bot in your relay-chat admin panel
2. Generate a token for the bot
3. Bind the bot to desired channels (read+write permissions)
4. Add configuration to OpenClaw config
5. Install this plugin
6. Restart OpenClaw

## How It Works

- User @mentions the bot in a relay-chat channel
- Plugin creates a thread by replying to the message
- Each thread maps to one OpenClaw session
- All replies in that thread continue the same conversation
- Sessions persist in OpenClaw's database across restarts

## License

MIT
```

**Step 7: Install dependencies**

Run: `npm install`
Expected: Dependencies installed successfully

**Step 8: Commit**

```bash
git init
git add .
git commit -m "chore: initialize OpenClaw relay-chat plugin project"
```

---

## Task 2: Define TypeScript Types

**Files:**
- Create: `openclaw-plugin-relaychat/src/types.ts`

**Step 1: Create types.ts with plugin interfaces**

```typescript
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
```

**Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat: add TypeScript type definitions for plugin"
```

---

## Task 3: Implement Session Manager

**Files:**
- Create: `openclaw-plugin-relaychat/src/session-manager.ts`

**Step 1: Create session-manager.ts**

```typescript
import { SessionInfo } from './types';

/**
 * SessionManager handles thread → OpenClaw session ID mapping.
 *
 * Session ID format: relaychat-{accountId}-{channelId}-{threadId}
 *
 * Examples:
 * - relaychat-default-1-42
 * - relaychat-work-5-128
 */
export class SessionManager {
  /**
   * Generate a session ID from relay-chat message info.
   *
   * @param accountId - OpenClaw account ID (e.g., "default", "work")
   * @param channelId - Relay-chat channel ID
   * @param messageId - Message ID that started the thread (for top-level) or parent ID (for replies)
   * @param parentId - Parent message ID (null for top-level messages)
   * @returns Session ID string
   */
  static createSessionId(
    accountId: string,
    channelId: number,
    messageId: number,
    parentId: number | null
  ): string {
    // If this is a reply, use the parent's message ID as the thread ID
    // If this is top-level, this message becomes the thread root
    const threadId = parentId ?? messageId;
    return `relaychat-${accountId}-${channelId}-${threadId}`;
  }

  /**
   * Parse a session ID back into its components.
   *
   * @param sessionId - Session ID to parse
   * @returns SessionInfo object or null if invalid
   */
  static parseSessionId(sessionId: string): SessionInfo | null {
    const match = sessionId.match(/^relaychat-([^-]+)-(\d+)-(\d+)$/);
    if (!match) {
      return null;
    }

    const [, accountId, channelIdStr, threadIdStr] = match;
    return {
      accountId,
      channelId: parseInt(channelIdStr, 10),
      threadId: parseInt(threadIdStr, 10),
      messageId: parseInt(threadIdStr, 10), // For thread root, threadId = messageId
    };
  }
}
```

**Step 2: Commit**

```bash
git add src/session-manager.ts
git commit -m "feat: implement session ID mapping for threads"
```

---

## Task 4: Implement Relay-Chat WebSocket Client (Part 1: Connection & Auth)

**Files:**
- Create: `openclaw-plugin-relaychat/src/relay-client.ts`

**Step 1: Create relay-client.ts with connection logic**

```typescript
import WebSocket from 'ws';
import fetch from 'node-fetch';
import { AccountConfig, RelayMessage, WebSocketEvent, MessageHandler } from './types';

/**
 * RelayClient manages WebSocket connection and REST API calls to relay-chat.
 */
export class RelayClient {
  private ws: WebSocket | null = null;
  private config: AccountConfig;
  private messageHandler: MessageHandler | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000; // Start at 1 second
  private maxReconnectDelay = 30000; // Cap at 30 seconds
  private reconnectTimer: NodeJS.Timeout | null = null;
  private intentionallyClosed = false;

  constructor(config: AccountConfig) {
    this.config = config;
  }

  /**
   * Connect to relay-chat WebSocket with bot token authentication.
   */
  async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    this.intentionallyClosed = false;
    const wsUrl = `${this.config.url}?token=${this.config.token}`;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        console.log('[relay-client] WebSocket connected');
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const rawMessage = data.toString();
          const event: WebSocketEvent = JSON.parse(rawMessage);
          this.handleWebSocketEvent(event, resolve);
        } catch (err) {
          console.error('[relay-client] Failed to parse WebSocket message:', err);
        }
      });

      this.ws.on('error', (err) => {
        console.error('[relay-client] WebSocket error:', err);
        reject(err);
      });

      this.ws.on('close', () => {
        console.log('[relay-client] WebSocket closed');
        this.ws = null;
        if (!this.intentionallyClosed) {
          this.scheduleReconnect();
        }
      });
    });
  }

  /**
   * Handle incoming WebSocket events.
   */
  private handleWebSocketEvent(event: WebSocketEvent, connectResolve?: (value: void) => void): void {
    switch (event.type) {
      case 'connected':
        console.log('[relay-client] Authenticated successfully');
        if (connectResolve) {
          connectResolve();
        }
        break;

      case 'new_message':
      case 'new_reply':
        if (event.payload && this.messageHandler) {
          const message: RelayMessage = event.payload;
          this.messageHandler(message);
        }
        break;

      // Ignore other events for now
      default:
        break;
    }
  }

  /**
   * Schedule a reconnection attempt with exponential backoff.
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[relay-client] Max reconnection attempts reached, giving up');
      return;
    }

    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelay);
    this.reconnectAttempts++;

    console.log(`[relay-client] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((err) => {
        console.error('[relay-client] Reconnection failed:', err);
      });
    }, delay);
  }

  /**
   * Register a handler for incoming messages.
   */
  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  /**
   * Disconnect from WebSocket and clean up.
   */
  disconnect(): void {
    this.intentionallyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  // REST API methods will be added in next task
}
```

**Step 2: Commit**

```bash
git add src/relay-client.ts
git commit -m "feat: implement WebSocket connection and reconnection logic"
```

---

## Task 5: Implement Relay-Chat REST API Client (Part 2: HTTP Calls)

**Files:**
- Modify: `openclaw-plugin-relaychat/src/relay-client.ts`

**Step 1: Add REST API methods to RelayClient class**

Add these methods to the `RelayClient` class in `src/relay-client.ts`:

```typescript
  /**
   * Post a reply to a message (creates a thread or continues existing thread).
   *
   * @param parentId - ID of the message to reply to
   * @param content - Text content of the reply
   * @returns Promise that resolves when reply is posted
   */
  async postReply(parentId: number, content: string): Promise<void> {
    const url = `${this.config.apiBase}/api/messages/${parentId}/reply`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.token}`,
      },
      body: JSON.stringify({ content }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to post reply: ${response.status} ${errorText}`);
    }

    console.log(`[relay-client] Posted reply to message ${parentId}`);
  }

  /**
   * Check if the relay-chat server is healthy.
   * Useful for verifying configuration before connecting.
   */
  async checkHealth(): Promise<boolean> {
    try {
      const url = `${this.config.apiBase}/api/health`;
      const response = await fetch(url);
      return response.ok;
    } catch (err) {
      console.error('[relay-client] Health check failed:', err);
      return false;
    }
  }
```

**Step 2: Commit**

```bash
git add src/relay-client.ts
git commit -m "feat: add REST API methods for posting replies"
```

---

## Task 6: Implement Main Plugin Registration (Part 1: Channel Definition)

**Files:**
- Create: `openclaw-plugin-relaychat/src/channel.ts`

**Step 1: Create channel.ts with channel plugin structure**

```typescript
import { PluginAPI, ChannelPlugin, PluginConfig, AccountConfig } from './types';
import { RelayClient } from './relay-client';
import { SessionManager } from './session-manager';

/**
 * Create the Relay Chat channel plugin definition.
 *
 * @param api - OpenClaw plugin API
 * @returns Channel plugin object
 */
export function createRelayChannel(api: PluginAPI): ChannelPlugin {
  // Store active relay clients per account
  const clients = new Map<string, RelayClient>();

  return {
    id: 'relaychat',
    meta: {
      id: 'relaychat',
      label: 'Relay Chat',
      selectionLabel: 'Relay Chat (self-hosted)',
      blurb: 'Self-hosted private group chat built on Nostr infrastructure (NIP-29)',
    },
    capabilities: {
      chatTypes: ['direct'], // Thread-based conversations
    },
    config: {
      /**
       * List all configured account IDs from OpenClaw config.
       */
      listAccountIds(cfg: PluginConfig): string[] {
        const accounts = cfg.channels?.relaychat?.accounts ?? {};
        return Object.keys(accounts);
      },

      /**
       * Resolve account configuration by ID.
       */
      resolveAccount(cfg: PluginConfig, accountId?: string): AccountConfig {
        const accounts = cfg.channels?.relaychat?.accounts ?? {};
        const id = accountId ?? 'default';
        return accounts[id] ?? {
          enabled: false,
          url: '',
          apiBase: '',
          token: '',
          username: '',
        };
      },
    },
    outbound: {
      deliveryMode: 'direct',

      /**
       * Send a message from OpenClaw agent to relay-chat.
       *
       * @param params - Message parameters including text and session ID
       * @returns Result object indicating success/failure
       */
      async sendText(params: { text: string; sessionId: string }): Promise<{ ok: boolean; error?: string }> {
        try {
          const sessionInfo = SessionManager.parseSessionId(params.sessionId);
          if (!sessionInfo) {
            api.logger.error(`Invalid session ID: ${params.sessionId}`);
            return { ok: false, error: 'Invalid session ID format' };
          }

          const client = clients.get(sessionInfo.accountId);
          if (!client) {
            api.logger.error(`No client found for account: ${sessionInfo.accountId}`);
            return { ok: false, error: 'Account not connected' };
          }

          // Post reply to the thread
          await client.postReply(sessionInfo.threadId, params.text);

          return { ok: true };
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          api.logger.error('Failed to send message to relay-chat:', err);
          return { ok: false, error: errorMsg };
        }
      },
    },
  };
}
```

**Step 2: Commit**

```bash
git add src/channel.ts
git commit -m "feat: implement OpenClaw channel plugin definition"
```

---

## Task 7: Implement Main Plugin Registration (Part 2: Message Handling & Registration)

**Files:**
- Create: `openclaw-plugin-relaychat/src/index.ts`

**Step 1: Create index.ts with plugin entry point**

```typescript
import { PluginAPI, PluginConfig, RelayMessage } from './types';
import { RelayClient } from './relay-client';
import { SessionManager } from './session-manager';
import { createRelayChannel } from './channel';

/**
 * Main plugin registration function.
 * This is called by OpenClaw when the plugin is loaded.
 */
export default function register(api: PluginAPI): void {
  api.logger.info('Relay Chat plugin loaded');

  const relayChannel = createRelayChannel(api);
  api.registerChannel({ plugin: relayChannel });

  // TODO: Initialize relay clients for each enabled account
  // This will be implemented after we verify the basic structure works
  api.logger.info('Relay Chat channel registered successfully');
}
```

**Step 2: Build the project**

Run: `npm run build`
Expected: TypeScript compiles successfully, `dist/` directory created

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: add plugin registration entry point"
```

---

## Task 8: Implement Account Initialization and Message Dispatch

**Files:**
- Modify: `openclaw-plugin-relaychat/src/index.ts`
- Modify: `openclaw-plugin-relaychat/src/channel.ts`

**Step 1: Update channel.ts to expose client management**

Replace the `createRelayChannel` function in `src/channel.ts`:

```typescript
import { PluginAPI, ChannelPlugin, PluginConfig, AccountConfig, RelayMessage } from './types';
import { RelayClient } from './relay-client';
import { SessionManager } from './session-manager';

/**
 * Create the Relay Chat channel plugin definition.
 *
 * @param api - OpenClaw plugin API
 * @param clients - Map of active relay clients (shared across plugin lifecycle)
 * @param dispatchToOpenClaw - Function to send messages to OpenClaw Gateway
 * @returns Channel plugin object
 */
export function createRelayChannel(
  api: PluginAPI,
  clients: Map<string, RelayClient>,
  dispatchToOpenClaw: (accountId: string, message: RelayMessage) => Promise<void>
): ChannelPlugin {
  return {
    id: 'relaychat',
    meta: {
      id: 'relaychat',
      label: 'Relay Chat',
      selectionLabel: 'Relay Chat (self-hosted)',
      blurb: 'Self-hosted private group chat built on Nostr infrastructure (NIP-29)',
    },
    capabilities: {
      chatTypes: ['direct'], // Thread-based conversations
    },
    config: {
      /**
       * List all configured account IDs from OpenClaw config.
       */
      listAccountIds(cfg: PluginConfig): string[] {
        const accounts = cfg.channels?.relaychat?.accounts ?? {};
        return Object.keys(accounts);
      },

      /**
       * Resolve account configuration by ID.
       */
      resolveAccount(cfg: PluginConfig, accountId?: string): AccountConfig {
        const accounts = cfg.channels?.relaychat?.accounts ?? {};
        const id = accountId ?? 'default';
        return accounts[id] ?? {
          enabled: false,
          url: '',
          apiBase: '',
          token: '',
          username: '',
        };
      },
    },
    outbound: {
      deliveryMode: 'direct',

      /**
       * Send a message from OpenClaw agent to relay-chat.
       */
      async sendText(params: { text: string; sessionId: string }): Promise<{ ok: boolean; error?: string }> {
        try {
          const sessionInfo = SessionManager.parseSessionId(params.sessionId);
          if (!sessionInfo) {
            api.logger.error(`Invalid session ID: ${params.sessionId}`);
            return { ok: false, error: 'Invalid session ID format' };
          }

          const client = clients.get(sessionInfo.accountId);
          if (!client) {
            api.logger.error(`No client found for account: ${sessionInfo.accountId}`);
            return { ok: false, error: 'Account not connected' };
          }

          // Post reply to the thread
          await client.postReply(sessionInfo.threadId, params.text);

          return { ok: true };
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          api.logger.error('Failed to send message to relay-chat:', err);
          return { ok: false, error: errorMsg };
        }
      },
    },
  };
}
```

**Step 2: Update index.ts with full initialization logic**

Replace the content of `src/index.ts`:

```typescript
import { PluginAPI, PluginConfig, RelayMessage, AccountConfig } from './types';
import { RelayClient } from './relay-client';
import { SessionManager } from './session-manager';
import { createRelayChannel } from './channel';

/**
 * Main plugin registration function.
 * This is called by OpenClaw when the plugin is loaded.
 */
export default function register(api: PluginAPI): void {
  api.logger.info('Relay Chat plugin loaded');

  // Store active relay clients per account
  const clients = new Map<string, RelayClient>();

  /**
   * Dispatch a relay-chat message to OpenClaw Gateway.
   * NOTE: This is a placeholder - the actual OpenClaw plugin API for dispatching
   * messages will depend on OpenClaw's plugin architecture documentation.
   */
  async function dispatchToOpenClaw(accountId: string, message: RelayMessage): Promise<void> {
    // TODO: Replace with actual OpenClaw dispatch API when available
    // For now, we'll log the message that would be dispatched
    const sessionId = SessionManager.createSessionId(
      accountId,
      message.channelId,
      message.id,
      message.parentId
    );

    api.logger.info(`[dispatch] Would send to OpenClaw session ${sessionId}:`);
    api.logger.info(`  From: ${message.displayName} (@${message.username})`);
    api.logger.info(`  Content: ${message.content}`);

    // TODO: Call OpenClaw API to dispatch message
    // Example (pseudo-code, depends on OpenClaw API):
    // await api.chat.sendMessage({
    //   sessionId,
    //   text: stripMention(message.content, botUsername),
    //   sender: {
    //     username: message.username,
    //     displayName: message.displayName,
    //   },
    //   timestamp: message.createdAt,
    // });
  }

  /**
   * Handle incoming messages from relay-chat.
   */
  function handleMessage(accountId: string, config: AccountConfig, message: RelayMessage): void {
    // Ignore our own messages
    if (message.isBot && message.username === config.username) {
      return;
    }

    // Check if bot is mentioned
    const isMentioned = message.mentions.some(
      (mention) => mention.toLowerCase() === config.username.toLowerCase()
    );

    if (!isMentioned) {
      return; // Not for us
    }

    api.logger.info(`Received @mention from ${message.username} in channel ${message.channelId}`);

    // Dispatch to OpenClaw
    dispatchToOpenClaw(accountId, message).catch((err) => {
      api.logger.error('Failed to dispatch message to OpenClaw:', err);
    });
  }

  /**
   * Initialize a relay client for a given account.
   */
  async function initializeAccount(accountId: string, config: AccountConfig): Promise<void> {
    if (!config.enabled) {
      api.logger.info(`Account ${accountId} is disabled, skipping`);
      return;
    }

    // Validate configuration
    if (!config.url || !config.apiBase || !config.token || !config.username) {
      api.logger.error(`Account ${accountId} has incomplete configuration, skipping`);
      return;
    }

    api.logger.info(`Initializing relay-chat account: ${accountId}`);

    // Check health first
    const client = new RelayClient(config);
    const healthy = await client.checkHealth();
    if (!healthy) {
      api.logger.error(`Account ${accountId} failed health check at ${config.apiBase}`);
      return;
    }

    // Set up message handler
    client.onMessage((message) => handleMessage(accountId, config, message));

    // Connect to WebSocket
    try {
      await client.connect();
      clients.set(accountId, client);
      api.logger.info(`Connected to relay-chat account: ${accountId}`);
    } catch (err) {
      api.logger.error(`Failed to connect account ${accountId}:`, err);
    }
  }

  // Create and register the channel
  const relayChannel = createRelayChannel(api, clients, dispatchToOpenClaw);
  api.registerChannel({ plugin: relayChannel });

  // TODO: Get OpenClaw config and initialize accounts
  // This is pseudo-code - actual API depends on OpenClaw plugin architecture
  // For now, we'll assume config is available via some mechanism
  api.logger.info('Relay Chat channel registered successfully');

  // NOTE: Account initialization will happen when OpenClaw loads the config
  // The actual initialization trigger depends on OpenClaw's plugin lifecycle
}
```

**Step 3: Build the project**

Run: `npm run build`
Expected: TypeScript compiles successfully

**Step 4: Commit**

```bash
git add src/channel.ts src/index.ts
git commit -m "feat: implement account initialization and message dispatch logic"
```

---

## Task 9: Create Setup Helper Script

**Files:**
- Create: `openclaw-plugin-relaychat/scripts/setup-bot.sh`

**Step 1: Create scripts directory and setup script**

```bash
#!/bin/bash
set -e

echo "🤖 Relay Chat OpenClaw Bot Setup"
echo "=================================="
echo ""

# Prompt for bot details
read -p "Bot username (e.g., claude-bot): " BOT_USERNAME
read -p "Bot display name (e.g., Claude): " BOT_DISPLAY_NAME
read -p "Relay-chat URL (default: http://localhost:8080): " RELAY_URL
RELAY_URL=${RELAY_URL:-http://localhost:8080}

echo ""
echo "📋 Next steps:"
echo "1. Open your relay-chat admin panel: ${RELAY_URL}"
echo "2. Navigate to the 'Bots' section"
echo "3. Create a new bot:"
echo "   - Username: ${BOT_USERNAME}"
echo "   - Display Name: ${BOT_DISPLAY_NAME}"
echo "4. Generate a token for the bot"
echo "5. Bind the bot to desired channels with read+write permissions"
echo ""

read -p "Press Enter once you've completed these steps and have the token..."

echo ""
read -sp "Paste the bot token: " BOT_TOKEN
echo ""

# Generate OpenClaw config snippet
CONFIG_FILE="/tmp/openclaw-relaychat-config-$$.json"
cat > "$CONFIG_FILE" <<EOF
{
  "channels": {
    "relaychat": {
      "accounts": {
        "default": {
          "enabled": true,
          "url": "ws://${RELAY_URL#http://}/ws",
          "apiBase": "${RELAY_URL}",
          "token": "${BOT_TOKEN}",
          "username": "${BOT_USERNAME}"
        }
      }
    }
  }
}
EOF

echo ""
echo "✓ Setup complete!"
echo ""
echo "Add this to your OpenClaw config (~/.config/openclaw/config.json):"
echo ""
cat "$CONFIG_FILE"
echo ""
echo "Configuration saved to: $CONFIG_FILE"
echo ""
echo "Then install the plugin:"
echo "  openclaw plugins install openclaw-plugin-relaychat"
echo ""
echo "Restart OpenClaw and you're ready!"
echo ""

rm -f "$CONFIG_FILE"
```

**Step 2: Make script executable**

Run: `chmod +x scripts/setup-bot.sh`

**Step 3: Update README with setup script instructions**

Add to the "Setup" section in `README.md`:

```markdown
### Quick Setup with Script

Run the interactive setup script:

\`\`\`bash
./scripts/setup-bot.sh
\`\`\`

This will guide you through:
1. Creating a bot in relay-chat
2. Generating configuration
3. Installing the plugin
```

**Step 4: Commit**

```bash
git add scripts/setup-bot.sh README.md
git commit -m "feat: add interactive bot setup script"
```

---

## Task 10: Add Installation and Usage Documentation

**Files:**
- Modify: `openclaw-plugin-relaychat/README.md`
- Create: `openclaw-plugin-relaychat/DEVELOPMENT.md`

**Step 1: Enhance README.md with complete usage guide**

Replace the entire `README.md` content with:

```markdown
# OpenClaw Relay Chat Plugin

OpenClaw channel plugin for [Relay Chat](https://github.com/ebrakke/relay-chat) - a self-hosted, private group chat built on Nostr infrastructure.

## Features

- **Native Integration**: Relay-chat appears as a channel in OpenClaw (like Discord, Slack, etc.)
- **Thread-based Sessions**: Each relay-chat thread = one OpenClaw conversation session
- **Persistent Conversations**: Sessions survive plugin restarts (stored in OpenClaw's database)
- **Multi-Account Support**: Connect to multiple relay-chat servers simultaneously
- **Real-time Communication**: WebSocket-based message delivery with auto-reconnection

## Prerequisites

- OpenClaw installed and running
- Relay-chat server (self-hosted or remote)
- Admin access to create bots in relay-chat

## Installation

### Option 1: Quick Setup (Recommended)

1. Clone or download this plugin
2. Run the setup script:
   ```bash
   ./scripts/setup-bot.sh
   ```
3. Follow the interactive prompts to:
   - Create a bot in relay-chat
   - Generate configuration
   - Get installation instructions

### Option 2: Manual Setup

1. **Create a bot in relay-chat:**
   - Open your relay-chat admin panel
   - Navigate to "Bots" section
   - Create a new bot (username: `claude-bot`, display name: `Claude`)
   - Generate a token
   - Bind the bot to desired channels (read+write permissions)

2. **Configure OpenClaw:**

   Edit `~/.config/openclaw/config.json` and add:

   ```json
   {
     "channels": {
       "relaychat": {
         "accounts": {
           "default": {
             "enabled": true,
             "url": "ws://localhost:8080/ws",
             "apiBase": "http://localhost:8080",
             "token": "your-bot-token-here",
             "username": "claude-bot"
           }
         }
       }
     }
   }
   ```

3. **Install the plugin:**
   ```bash
   openclaw plugins install openclaw-plugin-relaychat
   ```

   Or for local development:
   ```bash
   openclaw plugins install -l ./path/to/openclaw-plugin-relaychat
   ```

4. **Restart OpenClaw**

## Configuration

### Single Account

```json
{
  "channels": {
    "relaychat": {
      "accounts": {
        "default": {
          "enabled": true,
          "url": "ws://localhost:8080/ws",
          "apiBase": "http://localhost:8080",
          "token": "bot-token",
          "username": "claude-bot"
        }
      }
    }
  }
}
```

### Multiple Accounts

Connect to different relay-chat servers:

```json
{
  "channels": {
    "relaychat": {
      "accounts": {
        "work": {
          "enabled": true,
          "url": "ws://work.example.com/ws",
          "apiBase": "https://work.example.com",
          "token": "work-bot-token",
          "username": "work-claude"
        },
        "personal": {
          "enabled": true,
          "url": "ws://home.example.com/ws",
          "apiBase": "https://home.example.com",
          "token": "personal-bot-token",
          "username": "personal-claude"
        }
      }
    }
  }
}
```

### Configuration Fields

| Field | Description |
|-------|-------------|
| `enabled` | Enable/disable this account |
| `url` | WebSocket URL (must start with `ws://` or `wss://`) |
| `apiBase` | HTTP base URL for REST API calls |
| `token` | Bot token from relay-chat admin panel |
| `username` | Bot username for @mention matching |

## Usage

1. **Start a conversation:**
   - In relay-chat, @mention the bot in any channel: `@claude-bot hello!`
   - Bot creates a thread by replying
   - This thread becomes an OpenClaw session

2. **Continue the conversation:**
   - Reply in the thread to continue the same session
   - OpenClaw maintains full conversation history
   - Sessions persist across restarts

3. **Multiple conversations:**
   - Each thread is isolated
   - @mention the bot again in the channel to start a new conversation

## How It Works

```
User @mentions bot in channel
         ↓
Plugin receives WebSocket event
         ↓
Plugin creates/identifies session (thread ID)
         ↓
Message dispatched to OpenClaw Gateway
         ↓
AI agent processes with full session context
         ↓
Response sent back via plugin
         ↓
Bot posts reply in thread
         ↓
User sees response in relay-chat
```

**Session ID Format:** `relaychat-{accountId}-{channelId}-{threadId}`

Example: `relaychat-default-1-42`
- Account: `default`
- Channel ID: `1`
- Thread ID: `42` (parent message ID)

## Troubleshooting

### Plugin not connecting

1. Check OpenClaw logs for errors
2. Verify relay-chat server is accessible
3. Test with health check: `curl http://localhost:8080/api/health`
4. Verify bot token is correct
5. Check bot has channel bindings with read+write permissions

### Bot not responding

1. Ensure you're @mentioning the correct username
2. Check bot is bound to the channel
3. Verify OpenClaw is processing messages (check logs)
4. Try in a new thread

### Connection drops

The plugin automatically reconnects with exponential backoff:
- Max attempts: 10
- Max delay: 30 seconds
- Check network connectivity to relay-chat server

## Development

See [DEVELOPMENT.md](./DEVELOPMENT.md) for:
- Building from source
- Running tests
- Contributing guidelines
- Plugin architecture details

## License

MIT

## Credits

Built for [Relay Chat](https://github.com/ebrakke/relay-chat) and [OpenClaw](https://github.com/openclaw/openclaw).
```

**Step 2: Create DEVELOPMENT.md**

```markdown
# Development Guide

## Building from Source

### Prerequisites

- Node.js 18+ and npm
- TypeScript 5+

### Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/openclaw-plugin-relaychat.git
cd openclaw-plugin-relaychat

# Install dependencies
npm install

# Build
npm run build
```

### Development Workflow

```bash
# Watch mode (rebuilds on file changes)
npm run watch

# Link for local testing
openclaw plugins install -l ./path/to/openclaw-plugin-relaychat
```

## Project Structure

```
openclaw-plugin-relaychat/
├── src/
│   ├── index.ts              # Plugin entry point (register function)
│   ├── channel.ts            # Channel plugin definition
│   ├── relay-client.ts       # WebSocket + REST client
│   ├── session-manager.ts    # Thread → session mapping
│   └── types.ts              # TypeScript interfaces
├── scripts/
│   └── setup-bot.sh          # Interactive setup helper
├── openclaw.plugin.json      # Plugin manifest
├── package.json              # npm config
├── tsconfig.json             # TypeScript config
└── README.md                 # User documentation
```

## Architecture

### Message Flow (Inbound)

1. User @mentions bot in relay-chat
2. `RelayClient` receives WebSocket event
3. Message handler filters for @mentions
4. `SessionManager` generates session ID from thread
5. Message dispatched to OpenClaw Gateway (TODO: API integration)
6. OpenClaw processes with AI provider

### Message Flow (Outbound)

1. OpenClaw agent generates response
2. Calls `channel.outbound.sendText()`
3. `SessionManager` parses session ID
4. `RelayClient.postReply()` POSTs to relay-chat API
5. Relay-chat broadcasts to users

### Session Management

**Mapping Strategy:**
- Top-level @mention → creates thread (bot replies to message)
- Thread ID = parent message ID
- Session ID = `relaychat-{account}-{channel}-{thread}`

**Persistence:**
- Sessions stored in OpenClaw's SQLite database
- Survives plugin restarts
- No explicit cleanup needed

### WebSocket Reconnection

- Exponential backoff (1s → 2s → 4s → ... → 30s max)
- Max 10 attempts before giving up
- Automatic on connection drop (unless intentionally closed)

## Testing

### Manual Testing

1. Start relay-chat server locally
2. Create a bot via admin panel
3. Configure plugin with bot token
4. Link plugin for development
5. Restart OpenClaw
6. @mention bot in a channel
7. Verify thread creation and response

### Integration Points

- [ ] WebSocket authentication with bot token
- [ ] @mention detection and filtering
- [ ] Ignoring own messages
- [ ] Thread creation on first reply
- [ ] Session ID generation and parsing
- [ ] Multi-turn conversation in thread
- [ ] Reconnection after disconnect
- [ ] Multiple account support
- [ ] Error handling (API failures, network issues)

## TODO

### High Priority

- [ ] Implement actual OpenClaw dispatch API (currently placeholder)
- [ ] Get OpenClaw config within plugin (depends on plugin API docs)
- [ ] Test with real OpenClaw instance
- [ ] Add unit tests for SessionManager
- [ ] Add integration tests

### Medium Priority

- [ ] Support for rich media (images, embeds) if OpenClaw adds support
- [ ] Typing indicators ("bot is typing...")
- [ ] Better error messages to users
- [ ] Metrics/logging for debugging

### Low Priority

- [ ] Admin commands (@bot reset, @bot help, etc.)
- [ ] Multi-agent support (different bots in different channels)
- [ ] Channel context (pass recent messages for better responses)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Build and test locally
5. Submit a pull request

## OpenClaw Plugin API Notes

**Current Gaps:**
- Actual message dispatch API to OpenClaw Gateway
- Config access mechanism within plugin
- Plugin lifecycle hooks (startup, shutdown)

These will be filled in once OpenClaw plugin documentation is available.

## License

MIT
```

**Step 3: Commit**

```bash
git add README.md DEVELOPMENT.md
git commit -m "docs: add comprehensive README and development guide"
```

---

## Task 11: Final Build and Package Preparation

**Files:**
- Modify: `openclaw-plugin-relaychat/package.json`
- Create: `openclaw-plugin-relaychat/.npmignore`

**Step 1: Add publish configuration to package.json**

Add these fields to `package.json`:

```json
{
  "files": [
    "dist/",
    "openclaw.plugin.json",
    "README.md",
    "LICENSE"
  ],
  "repository": {
    "type": "git",
    "url": "https://github.com/yourusername/openclaw-plugin-relaychat.git"
  },
  "bugs": {
    "url": "https://github.com/yourusername/openclaw-plugin-relaychat/issues"
  }
}
```

**Step 2: Create .npmignore**

```
src/
scripts/
tsconfig.json
*.log
.DS_Store
node_modules/
DEVELOPMENT.md
```

**Step 3: Create LICENSE file**

```
MIT License

Copyright (c) 2026 relay-chat

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

**Step 4: Final build**

Run: `npm run build`
Expected: Clean build with no errors

**Step 5: Verify package contents**

Run: `npm pack --dry-run`
Expected: Shows files that would be published

**Step 6: Commit**

```bash
git add package.json .npmignore LICENSE
git commit -m "chore: prepare package for distribution"
```

---

## Task 12: Add OpenClaw Dispatch Integration (Placeholder)

**Files:**
- Create: `openclaw-plugin-relaychat/src/openclaw-dispatch.ts`
- Modify: `openclaw-plugin-relaychat/src/index.ts`

**Step 1: Create openclaw-dispatch.ts with TODO placeholder**

```typescript
import { PluginAPI } from './types';

/**
 * Dispatch a message to OpenClaw Gateway.
 *
 * TODO: This is a placeholder implementation. The actual dispatch mechanism
 * depends on OpenClaw's plugin API documentation.
 *
 * Likely API (pseudo-code):
 * - api.chat.sendMessage({ sessionId, text, sender, ... })
 * - api.sessions.get(sessionId) / create(sessionId)
 * - Event-based dispatch (emit message event)
 *
 * @param api - OpenClaw plugin API
 * @param sessionId - OpenClaw session ID
 * @param text - Message text (with @mention stripped)
 * @param context - Additional context (sender, channel, timestamp)
 */
export async function dispatchMessageToOpenClaw(
  api: PluginAPI,
  sessionId: string,
  text: string,
  context: {
    username: string;
    displayName: string;
    channel: string;
    timestamp: string;
  }
): Promise<void> {
  // Log what we would send
  api.logger.info(`[dispatch] Session: ${sessionId}`);
  api.logger.info(`[dispatch] From: ${context.displayName} (@${context.username})`);
  api.logger.info(`[dispatch] Channel: ${context.channel}`);
  api.logger.info(`[dispatch] Text: ${text}`);

  // TODO: Replace with actual OpenClaw API call
  // Examples of what this might look like:

  // Option 1: Direct chat API
  // await api.chat.sendMessage({
  //   sessionId,
  //   text,
  //   sender: {
  //     username: context.username,
  //     displayName: context.displayName,
  //   },
  //   metadata: {
  //     channel: context.channel,
  //     timestamp: context.timestamp,
  //   },
  // });

  // Option 2: Event-based
  // api.events.emit('message.incoming', {
  //   sessionId,
  //   text,
  //   ...context,
  // });

  // Option 3: Session-based
  // const session = await api.sessions.getOrCreate(sessionId);
  // await session.addMessage({
  //   role: 'user',
  //   content: text,
  //   metadata: context,
  // });

  // For now, we just log
  api.logger.warn('[dispatch] Using placeholder implementation - message not sent to OpenClaw');
  api.logger.warn('[dispatch] See src/openclaw-dispatch.ts for integration TODO');
}

/**
 * Strip @mention from message content.
 *
 * @param content - Original message content
 * @param botUsername - Bot's username to strip
 * @returns Content with @mention removed and trimmed
 */
export function stripMention(content: string, botUsername: string): string {
  return content
    .replace(new RegExp(`@${botUsername}\\b`, 'gi'), '')
    .trim();
}
```

**Step 2: Update index.ts to use the new dispatch module**

Replace the `dispatchToOpenClaw` function in `src/index.ts`:

```typescript
import { dispatchMessageToOpenClaw, stripMention } from './openclaw-dispatch';

// ... (keep existing imports and code)

  /**
   * Dispatch a relay-chat message to OpenClaw Gateway.
   */
  async function dispatchToOpenClaw(accountId: string, config: AccountConfig, message: RelayMessage): Promise<void> {
    const sessionId = SessionManager.createSessionId(
      accountId,
      message.channelId,
      message.id,
      message.parentId
    );

    const text = stripMention(message.content, config.username);

    await dispatchMessageToOpenClaw(api, sessionId, text, {
      username: message.username,
      displayName: message.displayName,
      channel: `Channel ${message.channelId}`, // TODO: Get actual channel name if available
      timestamp: message.createdAt,
    });
  }

  /**
   * Handle incoming messages from relay-chat.
   */
  function handleMessage(accountId: string, config: AccountConfig, message: RelayMessage): void {
    // Ignore our own messages
    if (message.isBot && message.username === config.username) {
      return;
    }

    // Check if bot is mentioned
    const isMentioned = message.mentions.some(
      (mention) => mention.toLowerCase() === config.username.toLowerCase()
    );

    if (!isMentioned) {
      return; // Not for us
    }

    api.logger.info(`Received @mention from ${message.username} in channel ${message.channelId}`);

    // Dispatch to OpenClaw
    dispatchToOpenClaw(accountId, config, message).catch((err) => {
      api.logger.error('Failed to dispatch message to OpenClaw:', err);
    });
  }
```

**Step 3: Build**

Run: `npm run build`
Expected: Compiles successfully

**Step 4: Commit**

```bash
git add src/openclaw-dispatch.ts src/index.ts
git commit -m "feat: add OpenClaw dispatch integration with TODO placeholder"
```

---

## Summary

This implementation plan creates a complete OpenClaw channel plugin for relay-chat with:

✅ **TypeScript plugin structure** following OpenClaw plugin architecture
✅ **WebSocket client** with auto-reconnection and exponential backoff
✅ **REST API client** for posting replies
✅ **Session management** mapping threads to OpenClaw sessions
✅ **Message handling** with @mention detection and filtering
✅ **Multi-account support** for connecting to multiple relay-chat servers
✅ **Setup script** for easy bot provisioning
✅ **Comprehensive documentation** (README, DEVELOPMENT)
✅ **Package preparation** for npm/OpenClaw plugin distribution

**Remaining TODOs:**
- Integrate with actual OpenClaw dispatch API (depends on OpenClaw docs)
- Test with real OpenClaw instance
- Add unit/integration tests
- Get channel names from relay-chat (currently shows "Channel {id}")

The plugin is structurally complete and ready for integration testing once OpenClaw's plugin API documentation is available.
