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
