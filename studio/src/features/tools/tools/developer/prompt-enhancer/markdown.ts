import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';

const markdown = new MarkdownIt({ html: false, breaks: true, linkify: false });
markdown.disable('image');
markdown.validateLink = (url) =>
  /^https?:\/\//i.test(url) && !Array.from(url).some((character) => character.charCodeAt(0) <= 32);
markdown.renderer.rules.link_open = (tokens, index, options, _env, renderer) => {
  tokens[index]!.attrSet('target', '_blank');
  tokens[index]!.attrSet('rel', 'noopener noreferrer');
  return renderer.renderToken(tokens, index, options);
};

export function renderMessage(content: string): string {
  if (!DOMPurify.isSupported) return '';
  return DOMPurify.sanitize(markdown.render(content), {
    ALLOWED_TAGS: [
      'p',
      'br',
      'strong',
      'em',
      's',
      'a',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'ul',
      'ol',
      'li',
      'blockquote',
      'pre',
      'code',
      'hr',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'start'],
    ALLOW_DATA_ATTR: false,
  });
}
