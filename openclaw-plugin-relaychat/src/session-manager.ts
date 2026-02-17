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
