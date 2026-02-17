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
