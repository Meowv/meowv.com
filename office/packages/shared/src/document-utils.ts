import { getMime } from 'ranuts/utils';
import type { DocumentType } from './document-types';

export const BASE_PATH = '/';

/**
 * Parse the `readonly` URL query value into a boolean for pure preview mode.
 * Truthy forms: `?readonly=true`, `?readonly=1`, and bare `?readonly` (empty
 * string). Anything else (including absent / `false`) means editable.
 */
export const parseReadonly = (value: string | undefined): boolean => {
  return value === 'true' || value === '1' || value === '';
};

/**
 * Get document type from file extension
 */
export function getDocumentType(fileType: string): string | null {
  const type = fileType.toLowerCase();
  if (type === 'docx' || type === 'doc') {
    return 'word';
  } else if (type === 'xlsx' || type === 'xls' || type === 'csv') {
    return 'cell';
  } else if (type === 'pptx' || type === 'ppt') {
    return 'slide';
  }
  return null;
}

/**
 * Get MIME type from file extension (using ranuts getMime utility)
 * @param extension - File extension
 * @returns string - MIME type
 */
export function getMimeTypeFromExtension(extension: string): string {
  // Use ranuts getMime for common image types, fallback to image/png
  const mime = getMime(extension?.toLowerCase() || '');
  return mime || 'image/png';
}

/**
 * Document type mapping
 */
export const DOCUMENT_TYPE_MAP: Record<string, DocumentType> = {
  docx: 'word',
  doc: 'word',
  odt: 'word',
  rtf: 'word',
  txt: 'word',
  xlsx: 'cell',
  xls: 'cell',
  ods: 'cell',
  csv: 'cell',
  pptx: 'slide',
  ppt: 'slide',
  odp: 'slide',
};
