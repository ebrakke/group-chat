import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getMessage, getThreadReplies } from '$lib/server/lib/messages';

export const load: PageServerLoad = async ({ params, parent }) => {
  const { channel, threadId } = params;
  
  // Get parent data
  const { user } = await parent();
  
  // Load parent message
  const parentMessage = await getMessage(threadId);
  if (!parentMessage) {
    throw error(404, 'Message not found');
  }
  
  // Verify message is in the correct channel
  if (parentMessage.channelId !== channel) {
    throw error(404, 'Message not found in this channel');
  }
  
  // Load replies
  const replies = await getThreadReplies(threadId);
  
  return {
    parentMessage,
    replies,
    user,
  };
};
