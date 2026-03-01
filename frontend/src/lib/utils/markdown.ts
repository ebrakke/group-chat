import { marked, type TokenizerAndRendererExtension } from 'marked';
import { channelStore } from '$lib/stores/channels.svelte';

marked.setOptions({ breaks: true, gfm: true });

const renderer = new marked.Renderer();
renderer.link = ({ href, text }) => {
  // Internal channel links: client-side navigation (no target="_blank")
  if (href.startsWith('/channels/')) {
    return `<a href="${href}" class="rc-channel-mention">${text}</a>`;
  }
  return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
};

const mentionExtension: TokenizerAndRendererExtension = {
  name: 'mention',
  level: 'inline',
  start(src) {
    return src.match(/@/)?.index;
  },
  tokenizer(src) {
    const match = /^@([a-zA-Z0-9_-]+)/.exec(src);
    if (match) {
      return {
        type: 'mention',
        raw: match[0],
        username: match[1],
      };
    }
  },
  renderer(token) {
    return `<span class="rc-mention">@${(token as any).username}</span>`;
  },
};

const channelMentionExtension: TokenizerAndRendererExtension = {
  name: 'channelMention',
  level: 'inline',
  start(src) {
    return src.match(/#(?=[a-z0-9])/)?.index;
  },
  tokenizer(src) {
    const match = /^#([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)/.exec(src);
    if (match) {
      const name = match[1];
      const channel = channelStore.getByName(name);
      if (channel) {
        return {
          type: 'channelMention',
          raw: match[0],
          channelName: name,
        };
      }
    }
  },
  renderer(token) {
    const name = (token as any).channelName;
    return `<a href="/channels/${name}" class="rc-channel-mention">#${name}</a>`;
  },
};

marked.use({ renderer, extensions: [mentionExtension, channelMentionExtension] });

export function renderMarkdown(text: string): string {
  return marked.parse(text) as string;
}

export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
