import type {
  PageProvider,
  Publication,
  PublicationMetadata,
  PublicationPaginateOptions,
  ReaderLayoutProfile,
  TocItem,
} from '../../types/reader';
import { HtmlPageProvider, type HtmlBookSection } from '../html/HtmlPageProvider';
import { assertNotAborted } from '../rendered-page';
import { decodeBookText, splitTextSections, type TextSection } from './text-utils';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function sectionHtml(section: TextSection): string {
  const paragraphs = section.content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll('\n', '<br>')}</p>`)
    .join('');
  return `<!doctype html><html><body>${section.title ? `<h1>${escapeHtml(section.title)}</h1>` : ''}${paragraphs}</body></html>`;
}

export class TxtPublication implements Publication {
  readonly format = 'txt' as const;
  readonly layout = 'reflowable' as const;
  readonly metadata: PublicationMetadata;
  readonly toc: TocItem[];
  readonly cover: Blob | null = null;
  readonly #sections: TextSection[];
  #providers = new Set<PageProvider>();
  #disposed = false;

  private constructor(file: File, sections: TextSection[]) {
    this.metadata = { title: file.name.replace(/\.txt$/i, ''), authors: [] };
    this.#sections = sections;
    this.toc = sections.flatMap((section, sectionIndex) =>
      section.title
        ? [
            {
              label: section.title,
              locator: { kind: 'reflowable' as const, sectionIndex, progression: 0 },
            },
          ]
        : [],
    );
  }

  static async open(file: File, signal?: AbortSignal): Promise<TxtPublication> {
    assertNotAborted(signal);
    const text = decodeBookText(new Uint8Array(await file.arrayBuffer()));
    assertNotAborted(signal);
    return new TxtPublication(file, splitTextSections(text));
  }

  async paginate(
    profile: ReaderLayoutProfile,
    options: PublicationPaginateOptions = {},
  ): Promise<PageProvider> {
    if (this.#disposed) throw new Error('TXT 出版物已释放。');
    const sections: HtmlBookSection[] = this.#sections.map((section, sectionIndex) => ({
      id: String(sectionIndex),
      load: () => Promise.resolve(sectionHtml(section)),
    }));
    const provider = await HtmlPageProvider.create({
      sections,
      profile,
      paginateOptions: options,
    });
    this.#providers.add(provider);
    options.onProgress?.({ stage: 'cover', value: 0.82, message: '正在准备封面…' });
    return provider;
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    await Promise.all([...this.#providers].map((provider) => provider.dispose()));
    this.#providers.clear();
  }
}
