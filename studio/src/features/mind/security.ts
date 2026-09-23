import DOMPurify from 'dompurify';

const SAFE_URI_PATTERN = /^(?:(?:https?:|mailto:)|(?:[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$)))/i;

const SAFE_MARKUP_OPTIONS = {
  USE_PROFILES: { html: true },
  ALLOWED_URI_REGEXP: SAFE_URI_PATTERN,
  ALLOW_DATA_ATTR: false,
  FORBID_ATTR: ['style', 'src', 'srcset', 'srcdoc'],
  FORBID_TAGS: [
    'base',
    'embed',
    'form',
    'frame',
    'frameset',
    'iframe',
    'img',
    'input',
    'link',
    'meta',
    'object',
    'script',
    'source',
    'style',
    'textarea',
    'video',
    'audio',
    'svg',
    'math',
  ],
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const escaped: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return escaped[character] ?? character;
  });
}

export function sanitizeMindHtml(value: string): string {
  if (!DOMPurify.isSupported || typeof DOMPurify.sanitize !== 'function') {
    return escapeHtml(value);
  }
  return DOMPurify.sanitize(value, SAFE_MARKUP_OPTIONS) as string;
}

export function sanitizeMindLink(value: string): string | undefined {
  const link = value.trim();
  if (!link || /[\u0000-\u001f\u007f]/.test(link)) return undefined;

  const scheme = link.match(/^([a-z][a-z\d+.-]*):/i)?.[1]?.toLowerCase();
  if (scheme && scheme !== 'http' && scheme !== 'https' && scheme !== 'mailto') {
    return undefined;
  }
  return link;
}
