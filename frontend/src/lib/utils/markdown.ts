import { marked } from 'marked';

marked.setOptions({ breaks: true, gfm: true });

const renderer = new marked.Renderer();
renderer.link = ({ href, text }) => {
  return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
};
marked.use({ renderer });

export function renderMarkdown(text: string): string {
  return marked.parse(text) as string;
}

export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
