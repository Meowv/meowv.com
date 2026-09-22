import { onBeforeUnmount, watchEffect, type MaybeRefOrGetter } from 'vue';
import { toValue } from 'vue';

interface PageMetaOptions {
  title: MaybeRefOrGetter<string>;
  description: MaybeRefOrGetter<string>;
  canonical?: MaybeRefOrGetter<string | undefined>;
}

export function usePageMeta(options: PageMetaOptions): void {
  const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  let createdCanonical = false;

  function setMeta(selector: string, attributes: Record<string, string>, content: string): void {
    let element = document.head.querySelector<HTMLMetaElement>(selector);
    if (!element) {
      element = document.createElement('meta');
      Object.entries(attributes).forEach(([key, value]) => element!.setAttribute(key, value));
      document.head.append(element);
    }
    element.content = content;
  }

  watchEffect(() => {
    const title = toValue(options.title);
    const descriptionText = toValue(options.description);
    document.title = title;
    if (description) description.content = descriptionText;
    setMeta('meta[property="og:title"]', { property: 'og:title' }, title);
    setMeta('meta[property="og:description"]', { property: 'og:description' }, descriptionText);
    setMeta('meta[name="twitter:title"]', { name: 'twitter:title' }, title);
    setMeta('meta[name="twitter:description"]', { name: 'twitter:description' }, descriptionText);

    const href = options.canonical ? toValue(options.canonical) : undefined;
    if (href) {
      if (!canonical) {
        canonical = document.createElement('link');
        canonical.rel = 'canonical';
        document.head.append(canonical);
        createdCanonical = true;
      }
      canonical.href = href;
      setMeta('meta[property="og:url"]', { property: 'og:url' }, href);
    }
  });

  onBeforeUnmount(() => {
    if (createdCanonical) canonical?.remove();
  });
}
