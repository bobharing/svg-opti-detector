import chalk from 'chalk';
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
 * Generates an identifier string from SVG attributes
 * @param attrs - SVG attributes
 * @returns Formatted identifier string
 */
export function generateIdentifierString(attrs: SvgAttributes): string {
  const identifiers: string[] = [];
  
  if (attrs.class) identifiers.push(`class="${attrs.class}"`);
  if (attrs.id) identifiers.push(`id="${attrs.id}"`);
  if (attrs.width) identifiers.push(`width="${attrs.width}"`);
  if (attrs.height) identifiers.push(`height="${attrs.height}"`);
  if (attrs.viewBox) identifiers.push(`viewBox="${attrs.viewBox}"`);
  
  return identifiers.length > 0 ? ` (${chalk.gray(identifiers.join(', '))})` : '';
}
