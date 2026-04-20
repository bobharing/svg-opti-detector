import type { SvgAttributes } from './types';

/**
 * Formats byte count into human-readable string
 * @param bytes - Number of bytes
 * @returns Formatted string (e.g., "1.50 KB (1536 bytes)")
 */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB (${bytes} bytes)`;
  } else if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(2)} KB (${bytes} bytes)`;
  }
  return `${bytes} bytes`;
}

/**
 * Generates a plain-text identifier string from SVG attributes (no chalk, no parens).
 * Returns empty string when no attributes are present.
 * CLI reporter wraps this with chalk styling; MCP handlers use this directly.
 */
export function generateIdentifier(attrs: SvgAttributes): string {
  const identifiers: string[] = [];

  if (attrs.class) identifiers.push(`class="${attrs.class}"`);
  if (attrs.id) identifiers.push(`id="${attrs.id}"`);
  if (attrs.width) identifiers.push(`width="${attrs.width}"`);
  if (attrs.height) identifiers.push(`height="${attrs.height}"`);
  if (attrs.viewBox) identifiers.push(`viewBox="${attrs.viewBox}"`);

  return identifiers.join(', ');
}

/**
 * Strips all _ prefixed internal fields from an object.
 * Used before returning data from MCP handlers to keep responses clean.
 */
export function stripInternalFields<T extends object>(obj: T): Partial<T> {
  const result = {} as Partial<T>;
  for (const key of Object.keys(obj) as (keyof T)[]) {
    if (!(key as string).startsWith('_')) {
      result[key] = obj[key];
    }
  }
  return result;
}
