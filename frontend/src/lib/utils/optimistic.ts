/**
 * Optimistic update utilities for handling temporary message IDs
 */

/**
 * Generate a unique optimistic message ID
 */
export function generateOptimisticId(): string {
  return `optimistic-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Check if a message ID is an optimistic (temporary) ID
 */
export function isOptimisticId(id: string): boolean {
  return id.startsWith('optimistic-');
}

/**
 * Check if an optimistic message timestamp matches a real message timestamp
 * within a threshold (default 5 seconds)
 */
export function isRecentOptimistic(
  optimisticTimestamp: string, 
  realTimestamp: string, 
  thresholdMs: number = 5000
): boolean {
  return Math.abs(
    new Date(optimisticTimestamp).getTime() - new Date(realTimestamp).getTime()
  ) < thresholdMs;
}
