import type { GeneratedFile } from "../types";
import { sanitizeFileName, stripFileExtension } from "./naming";

export function downloadGeneratedFile(file: GeneratedFile): void {
  const url = URL.createObjectURL(file.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function bundleGeneratedFiles(
  files: GeneratedFile[],
  archiveName: string
): Promise<GeneratedFile> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();

  for (const file of files) {
    zip.file(file.name, file.blob);
  }

  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 }
  });

  return {
    name: sanitizeFileName(stripFileExtension(archiveName), "zip", "pdf-results"),
    blob,
    size: blob.size,
    mimeType: "application/zip"
  };
}
