declare module 'foliate-js/epub.js' {
  export interface EpubArchiveLoader {
    loadText(name: string): Promise<string | null>;
    loadBlob(name: string, type?: string): Promise<Blob | null>;
    getSize(name: string): number;
    sha1?(value: Uint8Array): Promise<Uint8Array>;
  }

  export class EPUB {
    constructor(loader: EpubArchiveLoader);
    init(): Promise<FoliateBook>;
  }
}

declare module 'foliate-js/mobi.js' {
  export class MOBI {
    constructor(options: { unzlib(value: Uint8Array): Promise<Uint8Array> | Uint8Array });
    open(file: Blob): Promise<FoliateBook>;
  }

  export function isMOBI(file: Blob): Promise<boolean>;
}

declare module 'foliate-js/fb2.js' {
  export function makeFB2(file: Blob): Promise<FoliateBook>;
}

interface FoliateContributor {
  name?: string;
  sortAs?: string;
}

interface FoliateMetadata {
  title?: string;
  language?: string;
  description?: string;
  author?: string | FoliateContributor | Array<string | FoliateContributor>;
}

interface FoliateTocItem {
  label?: string;
  href?: string;
  subitems?: FoliateTocItem[];
  children?: FoliateTocItem[];
}

interface FoliateSection {
  id?: string;
  cfi?: string;
  linear?: string;
  load(): Promise<string>;
  unload?(): void;
}

interface FoliateBook {
  metadata?: FoliateMetadata;
  rendition?: { layout?: string };
  sections: FoliateSection[];
  toc?: FoliateTocItem[];
  getCover?(): Promise<Blob | null>;
  resolveHref?(href: string): { index: number; anchor?: unknown } | null;
  destroy?(): void;
}
