import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getMessage, getThreadReplies } from '$lib/server/lib/messages';
import { getChannelByName } from '$lib/server/lib/channels';

export const load: PageServerLoad = async ({ params, parent }) => {
  const { channel, threadId } = params;
  
  // Get parent data
  const { user } = await parent();
  
  // Resolve channel name to channel object
  const channelObj = getChannelByName(channel);
  if (!channelObj) {
    throw error(404, 'Channel not found');
  }
  
  // Load parent message
  const parentMessage = await getMessage(threadId);
  if (!parentMessage) {
    throw error(404, 'Message not found');
  }
  
  // Verify message is in the correct channel (compare IDs)
  if (parentMessage.channelId !== channelObj.id) {
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
