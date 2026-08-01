# @ranuts/converter

In-browser Office document conversion via OnlyOffice **x2t** (WebAssembly):
docx / xlsx / pptx / csv / pdf, plus DOCX/PPTX media extraction and a couple of
pre-processing fixes (XLSX line breaks, PPTX). No server — everything runs in the
browser.

## Install

```bash
pnpm add @ranuts/converter
```

## Usage

```ts
import { X2TConverter } from '@ranuts/converter';

const converter = new X2TConverter();
await converter.init(); // loads the x2t WASM module
const result = await converter.convert(file, /* targetExt */ 'pdf');
```

## API

- `X2TConverter` — the converter. `init()` loads x2t; `convert(...)` runs a conversion.
- `extractDocxMediaUrls(bytes)` — pull media (images) out of a DOCX/PPTX zip as object URLs.
- `preprocessXlsxLineBreaks(bytes)` / `preprocessPptx(bytes)` — format-specific fixups applied before conversion.

## Requirements / gotchas

- **x2t WASM must be loaded by the host** and exposed on `window.Module`; the
  converter wraps that global (it does not bundle or fetch the WASM itself).
- Fonts for PDF rendering are fetched from `${BASE_PATH}fonts/` into the WASM FS
  (`BASE_PATH` comes from `@ranuts/shared`).
- Browser-only (uses `window`, `fetch`, `Blob`, File System Access API for saving).

Depends on `@ranuts/shared`, `ranuts`, `ranui` (toast on save). Builds to `dist/`
via `prepare` on install.
