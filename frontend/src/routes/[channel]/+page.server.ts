import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getChannel } from '$lib/server/lib/channels';
import { getMessages } from '$lib/server/lib/messages';

export const load: PageServerLoad = async ({ params, parent }) => {
  const channelId = params.channel;
  
  // Get parent data (user, token, channels)
  const { user } = await parent();
  
  // Validate channel exists
  const channel = getChannel(channelId);
  if (!channel) {
    throw error(404, `Channel "${channelId}" not found`);
  }
  
  // Load messages
  const messages = await getMessages(channelId);
  
  return {
    channel,
    messages,
    user,
  };
};
