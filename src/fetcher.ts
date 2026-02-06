import chalk from 'chalk';

/**
 * Fetches HTML from a URL or local file path
 * @param input - URL or file path
 * @returns HTML content
 */
export async function fetchHtml(input: string): Promise<string> {
  // Improved detection: treat anything not starting with http:// or https:// as a file
  if (/^https?:\/\//i.test(input)) {
    const response = await fetch(input);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.text();
  } else {
    // Support file:// and direct file paths
    let filePath = input;
    if (filePath.startsWith('file://')) {
      filePath = filePath.replace('file://', '');
    }
    // Use Bun's native path resolution
    filePath = Bun.resolveSync(filePath, process.cwd());
    console.log(chalk.green('Reading local file:'), filePath);
    return await Bun.file(filePath).text();
  }
}

