import { createReplyPrefixOptions, type OpenClawConfig } from 'openclaw/plugin-sdk';
import { PluginAPI, RelayMessage } from './types';

/**
 * Dispatch a message to OpenClaw Gateway using the plugin runtime API.
 *
 * Implementation based on Nextcloud Talk plugin pattern from openclaw/openclaw repository.
 * Reference: extensions/nextcloud-talk/src/inbound.ts (handleNextcloudTalkInbound function)
 *
 * @param api - OpenClaw plugin API
 * @param runtime - Plugin runtime (from getRelayRuntime())
 * @param config - OpenClaw configuration
 * @param params - Dispatch parameters
 */
export async function dispatchMessageToOpenClaw(
  api: PluginAPI,
  runtime: any, // PluginRuntime from openclaw/plugin-sdk
  config: any, // OpenClawConfig
  params: {
    sessionKey: string;
    accountId: string;
    message: RelayMessage;
    botUsername: string;
  },
  replyCallback: (text: string, threadId: number) => Promise<void>
): Promise<void> {
  const { sessionKey, accountId, message, botUsername } = params;

  // Strip @mention from message content
  const rawBody = stripMention(message.content, botUsername);

  if (!rawBody.trim()) {
    return;
  }

  const channelId = message.channelId;
  const threadId = message.parentId ?? message.id;

  // Check if bot was mentioned
  const wasMentioned = message.mentions.some(
    mention => mention.toLowerCase() === botUsername.toLowerCase()
  );

  // Format display label
  const fromLabel = `${message.displayName} (@${message.username})`;

  // Resolve storage path for session
  const storePath = runtime.channel.session.resolveStorePath(
    config.session?.store,
    { agentId: config.agent?.id || 'default' }
  );

  // Get previous timestamp for envelope formatting
  const previousTimestamp = runtime.channel.session.readSessionUpdatedAt({
    storePath,
    sessionKey,
  });

  // Get envelope formatting options
  const envelopeOptions = runtime.channel.reply.resolveEnvelopeFormatOptions(config);

  // Format the agent envelope
  const body = runtime.channel.reply.formatAgentEnvelope({
    channel: 'Relay Chat',
    from: fromLabel,
    timestamp: new Date(message.createdAt).getTime(),
    previousTimestamp,
    envelope: envelopeOptions,
    body: rawBody,
  });

  // Build context payload for the agent
  const ctxPayload = runtime.channel.reply.finalizeInboundContext({
    Body: body,
    BodyForAgent: rawBody,
    RawBody: message.content,
    CommandBody: rawBody,
    From: `relaychat:user:${message.userId}`,
    To: `relaychat:channel:${channelId}:thread:${threadId}`,
    SessionKey: sessionKey,
    AccountId: accountId,
    ChatType: 'direct',
    ConversationLabel: fromLabel,
    SenderName: message.displayName,
    SenderId: String(message.userId),
    Provider: 'relaychat',
    Surface: 'relaychat',
    WasMentioned: wasMentioned,
    MessageSid: String(message.id),
    Timestamp: new Date(message.createdAt).getTime(),
    OriginatingChannel: 'relaychat',
    OriginatingTo: `relaychat:channel:${channelId}:thread:${threadId}`,
    CommandAuthorized: true,
  });

  // Record inbound session
  await runtime.channel.session.recordInboundSession({
    storePath,
    sessionKey: ctxPayload.SessionKey ?? sessionKey,
    ctx: ctxPayload,
    onRecordError: (err: Error) => {
      api.logger.error(`relaychat: failed updating session meta: ${String(err)}`);
    },
  });

  // Create reply prefix options
  const { onModelSelected, ...prefixOptions } = createReplyPrefixOptions({
    cfg: config as OpenClawConfig,
    agentId: (config as any).agent?.id || 'default',
    channel: 'relaychat',
    accountId,
  });

  // Dispatch to agent - triggers agent execution
  // OpenClaw will call our channel plugin's outbound.sendText() with the response
  await runtime.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg: config,
    dispatcherOptions: {
      ...prefixOptions,
      deliver: async (payload: any) => {
        // This callback is invoked when agent has a response
        api.logger.info(`[dispatch] Agent response ready for session ${sessionKey}`);

        // Send the reply back to relay-chat
        if (payload.text) {
          await replyCallback(payload.text, threadId);
        }
      },
      onError: (err: Error, info: any) => {
        api.logger.error(`relaychat ${info.kind} reply failed: ${String(err)}`);
      },
    },
    replyOptions: {
      onModelSelected,
      disableBlockStreaming: false,
    },
  });
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
