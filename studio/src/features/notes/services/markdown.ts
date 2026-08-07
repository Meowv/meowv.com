import DOMPurify from 'dompurify';
import MarkdownIt from 'markdown-it';

let markdownInstance: MarkdownIt | null = null;

function getMarkdown(): MarkdownIt {
  if (markdownInstance) return markdownInstance;
  const instance = new MarkdownIt({
    html: false,
    linkify: true,
    breaks: false,
    typographer: false,
  });
  const defaultLinkOpen =
    instance.renderer.rules.link_open ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  instance.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const tag = defaultLinkOpen(tokens, idx, options, env, self);
    const href = tokens[idx].attrGet('href');
    const safe = typeof href === 'string' && /^https?:\/\//i.test(href);
    if (!safe) return tag;
    return tag.replace(/>$/, ' target="_blank" rel="noopener noreferrer">');
  };
  markdownInstance = instance;
  return instance;
}

export function renderNoteMarkdown(source: string): string {
  const html = getMarkdown().render(source);
  const sanitized = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target', 'rel'],
  });
  return sanitized;
}
