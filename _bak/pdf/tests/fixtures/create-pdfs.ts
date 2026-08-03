import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const A4_PORTRAIT: [number, number] = [595.28, 841.89];
const A4_LANDSCAPE: [number, number] = [841.89, 595.28];
const LETTER_PORTRAIT: [number, number] = [612, 792];
const ONE_PIXEL_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

async function createTextPdf(
  pages: Array<{ size: [number, number]; label?: string }>
): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);

  for (const [index, definition] of pages.entries()) {
    const page = document.addPage(definition.size);
    if (definition.label) {
      page.drawText(definition.label, {
        x: 48,
        y: definition.size[1] - 72,
        size: 20,
        font,
        color: rgb(0.1, 0.16, 0.25)
      });
    }
    page.drawText(`Fixture page ${index + 1}`, {
      x: 48,
      y: 48,
      size: 10,
      font,
      color: rgb(0.4, 0.45, 0.52)
    });
  }

  return document.save();
}

async function createImagePdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const page = document.addPage(A4_PORTRAIT);
  const image = await document.embedPng(Buffer.from(ONE_PIXEL_PNG, "base64"));

  page.drawImage(image, {
    x: 72,
    y: 320,
    width: 450,
    height: 200
  });

  return document.save();
}

export async function createPdfFixtures(
  outputDirectory = fileURLToPath(new URL(".", import.meta.url))
): Promise<string[]> {
  await mkdir(outputDirectory, { recursive: true });

  const fixtures = new Map<string, Uint8Array>([
    ["single-page.pdf", await createTextPdf([{ size: A4_PORTRAIT, label: "Single-page fixture" }])],
    [
      "multi-page.pdf",
      await createTextPdf([
        { size: A4_PORTRAIT, label: "Multi-page fixture: 1" },
        { size: A4_PORTRAIT, label: "Multi-page fixture: 2" },
        { size: A4_PORTRAIT, label: "Multi-page fixture: 3" }
      ])
    ],
    [
      "landscape-page.pdf",
      await createTextPdf([{ size: A4_LANDSCAPE, label: "Landscape fixture" }])
    ],
    [
      "mixed-page-sizes.pdf",
      await createTextPdf([
        { size: A4_PORTRAIT, label: "A4 portrait" },
        { size: LETTER_PORTRAIT, label: "Letter portrait" },
        { size: [500, 500], label: "Square page" }
      ])
    ],
    ["blank-page.pdf", await createTextPdf([{ size: A4_PORTRAIT }])],
    ["image-content.pdf", await createImagePdf()],
    [
      "chinese-content-placeholder.pdf",
      await createTextPdf([
        {
          size: A4_PORTRAIT,
          label: "CJK fixture placeholder: replace with an embedded licensed CJK font"
        }
      ])
    ],
    ["corrupted.pdf", new TextEncoder().encode("intentionally corrupted PDF test fixture")]
  ]);

  const writtenFiles: string[] = [];
  for (const [name, bytes] of fixtures) {
    const target = resolve(outputDirectory, name);
    await writeFile(target, bytes);
    writtenFiles.push(target);
  }

  // 首期不支持加密 PDF；这里不创建名称像加密文件、实际却未加密的误导性夹具。
  return writtenFiles;
}

const isDirectRun =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  await createPdfFixtures();
}
