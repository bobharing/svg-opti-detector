import { resolve } from 'path';

/**
 * Fetches HTML from a URL or local file path.
 * @param input - URL or file path
 * @param onFileRead - Optional callback called with the resolved file path when reading a local file
 * @returns HTML content
 */
export async function fetchHtml(
  input: string,
  onFileRead?: (filePath: string) => void
): Promise<string> {
  if (/^https?:\/\//i.test(input)) {
    const response = await fetch(input);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.text();
  } else {
    let filePath = input;
    if (filePath.startsWith('file://')) {
      filePath = filePath.replace('file://', '');
    }
    // Resolve relative paths from current working directory
    filePath = resolve(process.cwd(), filePath);
    onFileRead?.(filePath);
    return await Bun.file(filePath).text();
  }
}
