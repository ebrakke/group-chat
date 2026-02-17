import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { emptyPluginConfigSchema } from 'openclaw/plugin-sdk';
import { RelayMessage, AccountConfig } from './types';
import { RelayClient } from './relay-client';
import { SessionManager } from './session-manager';
import { createRelayChannel } from './channel';
import { dispatchMessageToOpenClaw } from './openclaw-dispatch';
import { setRelayRuntime, getRelayRuntime } from './runtime';

// Store active relay clients per account
const clients = new Map<string, RelayClient>();
const accountConfigs = new Map<string, AccountConfig>();

/**
 * Dispatch a relay-chat message to OpenClaw Gateway.
 */
async function dispatchToOpenClaw(accountId: string, message: RelayMessage): Promise<void> {
  const runtime = getRelayRuntime();
  const config = runtime.config.loadConfig();

  const sessionId = SessionManager.createSessionId(
    accountId,
    message.channelId,
    message.id,
    message.parentId
  );

  // Get account config to access bot username
  const accountConfig = accountConfigs.get(accountId);
  if (!accountConfig) {
    console.error(`No config found for account ${accountId}, cannot dispatch`);
    return;
  }

  await dispatchMessageToOpenClaw(
    {
      logger: {
        info: (msg: string) => console.log(msg),
        error: (msg: string, err?: any) => console.error(msg, err),
        warn: (msg: string) => console.warn(msg),
        debug: (msg: string) => console.debug(msg),
      }
    },
    runtime,
    config,
    {
      sessionKey: sessionId,
      accountId,
      message,
      botUsername: accountConfig.username,
    }
  );
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

  console.log(`Received @mention from ${message.username} in channel ${message.channelId}`);

  // Dispatch to OpenClaw
  dispatchToOpenClaw(accountId, message).catch((err) => {
    console.error('Failed to dispatch message to OpenClaw:', err);
  });
}

/**
 * Initialize a relay client for a given account.
 */
async function initializeAccount(accountId: string, config: AccountConfig): Promise<void> {
  if (!config.enabled) {
    console.log(`Account ${accountId} is disabled, skipping`);
    return;
  }

  // Validate configuration
  if (!config.url || !config.apiBase || !config.token || !config.username) {
    console.error(`Account ${accountId} has incomplete configuration, skipping`);
    return;
  }

  console.log(`Initializing relay-chat account: ${accountId}`);

  // Check health first
  const client = new RelayClient(config);
  const healthy = await client.checkHealth();
  if (!healthy) {
    console.error(`Account ${accountId} failed health check at ${config.apiBase}`);
    return;
  }

  // Set up message handler
  client.onMessage((message) => handleMessage(accountId, config, message));

  // Connect to WebSocket
  try {
    await client.connect();
    clients.set(accountId, client);
    accountConfigs.set(accountId, config);
    console.log(`Connected to relay-chat account: ${accountId}`);
  } catch (err) {
    console.error(`Failed to connect account ${accountId}:`, err);
  }
}

const plugin = {
  id: 'relaychat',
  name: 'Relay Chat',
  description: 'Relay Chat channel plugin for self-hosted NIP-29 group chat',
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setRelayRuntime(api.runtime);

    // Create and register the channel
    const mockApi = { logger: { info: console.log, error: console.error } };
    const relayChannel = createRelayChannel(mockApi as any, clients, dispatchToOpenClaw);
    api.registerChannel({ plugin: relayChannel as any });

    console.log('Relay Chat channel registered successfully');

    // Initialize accounts from config
    const config = api.runtime.config.loadConfig();
    const channelConfig = (config.channels as any)?.relaychat;

    if (channelConfig?.accounts) {
      Object.entries(channelConfig.accounts).forEach(([accountId, accountConfig]) => {
        initializeAccount(accountId, accountConfig as AccountConfig).catch((err) => {
          console.error(`Failed to initialize account ${accountId}:`, err);
        });
      });
    }
  },
};

export default plugin;
