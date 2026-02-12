import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getChannelByName } from '$lib/server/lib/channels';
import { getMessages } from '$lib/server/lib/messages';

export const load: PageServerLoad = async ({ params, parent }) => {
  const channelName = params.channel;
  
  // Get parent data (user, token, channels)
  const { user } = await parent();
  
  // Validate channel exists by name
  const channel = getChannelByName(channelName);
  if (!channel) {
    throw error(404, `Channel "${channelName}" not found`);
  }
  
  // Load messages using the channel ID
  const messages = await getMessages(channel.id);
  
  return {
    channel,
    messages,
    user,
  };
};
