/**
 * Markdown rendering utilities
 */

import { marked } from 'marked';

// Configure marked once globally
marked.setOptions({ 
  breaks: true,
  gfm: true
});

/**
 * Render markdown content to HTML
 */
export function renderMarkdown(content: string): string {
  return marked(content) as string;
}
