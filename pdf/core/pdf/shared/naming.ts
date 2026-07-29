// eslint-disable-next-line no-control-regex
const INVALID_PATH_CHARACTERS = /[<>:"/\\|?*\u0000-\u001f]/g;
const INVISIBLE_CHARACTERS = /[\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g;

export function sanitizeFileName(value: string, extension: string, fallback = "processed"): string {
  const normalizedExtension = extension.replace(/^\./, "").toLowerCase();
  const cleaned = value
    .replace(INVALID_PATH_CHARACTERS, "-")
    .replace(INVISIBLE_CHARACTERS, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.\s]+$/g, "");

  const withoutDuplicateExtensions = cleaned.replace(
    new RegExp(`(?:\\.${normalizedExtension})+$`, "i"),
    ""
  );
  const baseName = withoutDuplicateExtensions || fallback;

  return `${baseName}.${normalizedExtension}`;
}

export function stripFileExtension(name: string): string {
  const dotIndex = name.lastIndexOf(".");
  return dotIndex > 0 ? name.slice(0, dotIndex) : name;
}
