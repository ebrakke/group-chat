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
