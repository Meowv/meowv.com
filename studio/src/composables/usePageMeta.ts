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

  watchEffect(() => {
    document.title = toValue(options.title);
    if (description) description.content = toValue(options.description);

    const href = options.canonical ? toValue(options.canonical) : undefined;
    if (href) {
      if (!canonical) {
        canonical = document.createElement('link');
        canonical.rel = 'canonical';
        document.head.append(canonical);
        createdCanonical = true;
      }
      canonical.href = href;
    }
  });

  onBeforeUnmount(() => {
    if (createdCanonical) canonical?.remove();
  });
}
