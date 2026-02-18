// Markdown rendering utility
import { marked } from 'marked';

// Configure marked for proper markdown rendering
marked.setOptions({
  breaks: true,        // GFM line breaks
  gfm: true,           // GitHub Flavored Markdown
  headerIds: false,    // Don't add IDs to headers
  mangle: false,       // Don't mangle email addresses
});

// Custom renderer to add security and styling
const renderer = new marked.Renderer();

// Override link rendering to add security attributes
const originalLink = renderer.link.bind(renderer);
renderer.link = function(href, title, text) {
  const html = originalLink(href, title, text);
  return html.replace(/^<a /, '<a target="_blank" rel="noopener noreferrer" ');
};

marked.use({ renderer });

/**
 * Render markdown content to safe HTML
 * @param {string} content - Raw markdown text
 * @returns {string} - Rendered HTML
 */
export function renderMarkdown(content) {
  if (!content) return '';
  try {
    return marked.parse(content);
  } catch (e) {
    console.error("Markdown rendering failed:", e);
    // Fallback to escaped HTML if markdown parsing fails
    return escapeHtml(content);
  }
}

/**
 * Escape HTML for safe rendering (used for non-markdown content)
 * @param {string} s - Text to escape
 * @returns {string} - HTML-safe text
 */
export function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s || '';
  return div.innerHTML;
}
