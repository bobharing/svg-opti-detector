/**
 * Generates a hash for an SVG, ignoring class attributes
 * @param svg - SVG HTML string
 * @returns MD5 hash
 */
export function hashSvg(svg: string): string {
  // Normalize SVG content by removing class attributes for duplicate detection
  // This allows identical SVGs with different classes to be detected as duplicates
  const normalizedSvg = svg
    .replace(/\s+class="[^"]*"/g, '')
    .replace(/\s+class='[^']*'/g, '');
  const hasher = new Bun.CryptoHasher('md5');
  hasher.update(normalizedSvg);
  return hasher.digest('hex');
}
