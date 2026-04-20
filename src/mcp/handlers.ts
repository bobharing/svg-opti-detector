import { analyzeUrl, analyzeHtml } from '../core/analyzer.js';
import { optimizeSvg } from '../core/optimizer.js';
import { generateIdentifier } from '../core/utils.js';
import type { FullAnalysis } from '../core/analyzer.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

const MAX_HTML_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_SVG_BYTES = 1 * 1024 * 1024;  // 1 MB

function textResult(text: string): CallToolResult {
  return { content: [{ type: 'text', text }] };
}

function errorResult(text: string): CallToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

// ---------------------------------------------------------------------------
// Error classification helpers
// ---------------------------------------------------------------------------
function classifyFetchError(error: unknown, source: string): CallToolResult {
  if (error instanceof Error) {
    const msg = error.message;

    // File not found
    if ('code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return errorResult(
        `File not found: ${source}. ` +
          `Ensure this is an absolute path. ` +
          `Relative paths are resolved from the server's working directory (${process.cwd()}).`
      );
    }

    // HTTP errors
    if (msg.startsWith('HTTP error! status:')) {
      return errorResult(
        `Failed to fetch URL: ${source}. ${msg}. ` +
          `Check that the URL is reachable and returns HTML content.`
      );
    }

    // Network errors
    if (msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND')) {
      return errorResult(
        `Network error fetching ${source}: ${msg}. ` +
          `Check the URL is correct and reachable from this machine.`
      );
    }

    return errorResult(`Error processing ${source}: ${msg}`);
  }
  return errorResult(`Unknown error processing ${source}`);
}

// ---------------------------------------------------------------------------
// svg_scan handler
// ---------------------------------------------------------------------------

export interface ScanArgs {
  url?: string;
  html?: string;
  threshold?: number;
}

/**
 * Pure handler for the svg_scan tool.
 * Returns a compact summary with no SVG markup content.
 */
export async function handleScan(args: ScanArgs): Promise<CallToolResult> {
  // Validate: url or html required
  if (!args.url && !args.html) {
    return errorResult(
      "Either 'url' or 'html' parameter is required. " +
        'Provide a URL (https://...), absolute file path (/path/to/file.html), ' +
        'or raw HTML string via the html parameter.'
    );
  }

  // Enforce input size limit on html
  if (args.html) {
    const byteSize = new TextEncoder().encode(args.html).length;
    const mb = (byteSize / (1024 * 1024)).toFixed(2);
    if (byteSize > MAX_HTML_BYTES) {
      return errorResult(
        `HTML input exceeds 5 MB limit (received ${mb} MB). ` +
          'Provide a URL or absolute file path instead.'
      );
    }
  }

  const threshold = args.threshold ?? 5;

  // Run analysis
  let analysis: FullAnalysis;
  try {
    if (args.url) {
      analysis = await analyzeUrl(args.url);
    } else {
      analysis = await analyzeHtml(args.html!);
    }
  } catch (error) {
    return classifyFetchError(error, args.url ?? '<html input>');
  }

  const { source, svgs, stats } = analysis;

  // Build unoptimized and errors lists
  const unoptimized: Array<{
    index: number;
    identifier: string;
    originalSize: number;
    optimizedSize: number;
    savingsPercent: number;
  }> = [];
  const errors: Array<{ index: number; error: string; originalSize: number }> = [];

  for (const stat of stats.svgStats) {
    if (stat._optimizeError) {
      errors.push({
        index: stat.index,
        error: stat._optimizeError,
        originalSize: stat.originalSize
      });
    } else {
      const savingsPercent =
        stat.originalSize > 0
          ? ((stat.originalSize - stat.optimizedSize) / stat.originalSize) * 100
          : 0;

      if (savingsPercent >= threshold) {
        unoptimized.push({
          index: stat.index,
          identifier: generateIdentifier(svgs[stat.index].attributes),
          originalSize: stat.originalSize,
          optimizedSize: stat.optimizedSize,
          savingsPercent: Math.round(savingsPercent * 10) / 10
        });
      }
    }
  }

  // Build duplicate groups
  const duplicateGroups: Array<{
    count: number;
    indices: number[];
    wastedBytes: number;
    identifier: string;
  }> = [];
  let duplicateWastedBytes = 0;

  for (const [, indices] of Object.entries(stats.duplicates)) {
    const firstIndex = indices[0];
    const firstStat = stats.svgStats[firstIndex];
    const wastedBytes = (indices.length - 1) * firstStat.originalSize;
    duplicateWastedBytes += wastedBytes;

    duplicateGroups.push({
      count: indices.length,
      indices,
      wastedBytes,
      identifier: generateIdentifier(svgs[firstIndex].attributes)
    });
  }

  const totalSavingsPercent =
    stats.totalOriginalSize > 0
      ? ((stats.totalOriginalSize - stats.totalOptimizedSize) / stats.totalOriginalSize) * 100
      : 0;

  const response = {
    source: source || args.url || '<html input>',
    totalSvgs: svgs.length,
    unoptimized,
    ...(errors.length > 0 ? { errors } : {}),
    duplicateGroups,
    duplicateDetectionNote:
      'Duplicates are detected ignoring class attributes. ' +
      'SVGs identical except for class names are grouped together.',
    summary: {
      totalOriginalBytes: stats.totalOriginalSize,
      totalOptimizedBytes: stats.totalOptimizedSize,
      totalSavingsPercent: Math.round(totalSavingsPercent * 10) / 10,
      duplicateWastedBytes,
      duplicateGroupCount: duplicateGroups.length
    }
  };

  return textResult(JSON.stringify(response, null, 2));
}

// ---------------------------------------------------------------------------
// svg_get_optimized handler
// ---------------------------------------------------------------------------

export interface GetOptimizedArgs {
  url?: string;
  html?: string;
  svg?: string;
  indices?: number[];
}

/**
 * Pure handler for the svg_get_optimized tool.
 * Returns original and optimized SVG markup for requested indices.
 */
export async function handleGetOptimized(args: GetOptimizedArgs): Promise<CallToolResult> {
  // Validate: url, html, or svg required
  if (!args.url && !args.html && !args.svg) {
    return errorResult(
      "One of 'url', 'html', or 'svg' parameters is required. " +
        "Provide a URL/file path, raw HTML string, or a single SVG string to optimize."
    );
  }

  // Enforce size limits
  if (args.html) {
    const byteSize = new TextEncoder().encode(args.html).length;
    const mb = (byteSize / (1024 * 1024)).toFixed(2);
    if (byteSize > MAX_HTML_BYTES) {
      return errorResult(
        `HTML input exceeds 5 MB limit (received ${mb} MB). ` +
          'Provide a URL or absolute file path instead.'
      );
    }
  }

  if (args.svg) {
    const byteSize = new TextEncoder().encode(args.svg).length;
    const kb = (byteSize / 1024).toFixed(2);
    if (byteSize > MAX_SVG_BYTES) {
      return errorResult(
        `SVG input exceeds 1 MB limit (received ${kb} KB). ` +
          'This SVG is unusually large; consider providing a URL that contains the SVG instead.'
      );
    }
  }

  // Single SVG mode (svg parameter provided directly)
  if (args.svg) {
    const result = optimizeSvg(args.svg);
    const svgEntry: Record<string, unknown> = {
      index: 0,
      original: result.original,
      optimized: result.optimized,
      originalSize: result.originalSize,
      optimizedSize: result.optimizedSize,
      savingsPercent: Math.round(result.savingsPercent * 10) / 10
    };
    if (result.error) {
      svgEntry.error = result.error;
    }
    return textResult(JSON.stringify({ svgs: [svgEntry] }, null, 2));
  }

  // URL or HTML mode
  let analysis: FullAnalysis;
  try {
    if (args.url) {
      analysis = await analyzeUrl(args.url);
    } else {
      analysis = await analyzeHtml(args.html!);
    }
  } catch (error) {
    return classifyFetchError(error, args.url ?? '<html input>');
  }

  const { svgs, optimized } = analysis;

  // Determine which indices to return
  const requestedIndices = args.indices ?? optimized.map((_, i) => i);

  // Filter out-of-range indices
  const validIndices = requestedIndices.filter(i => i >= 0 && i < optimized.length);
  const invalidIndices = requestedIndices.filter(i => i < 0 || i >= optimized.length);

  if (validIndices.length === 0) {
    return errorResult(
      `No valid SVG indices found. ` +
        `Requested: [${requestedIndices.join(', ')}]. ` +
        `Valid range: 0–${optimized.length - 1} (${optimized.length} SVGs found). ` +
        `Use svg_scan to see available indices.`
    );
  }

  const resultSvgs = validIndices.map(i => {
    const opt = optimized[i];
    const entry: Record<string, unknown> = {
      index: i,
      identifier: generateIdentifier(svgs[i].attributes),
      original: opt.original,
      optimized: opt.optimized,
      originalSize: opt.originalSize,
      optimizedSize: opt.optimizedSize,
      savingsPercent: Math.round(opt.savingsPercent * 10) / 10
    };
    if (opt.error) {
      entry.error = opt.error;
    }
    return entry;
  });

  const response: Record<string, unknown> = { svgs: resultSvgs };
  if (invalidIndices.length > 0) {
    response.warnings = [
      `Indices out of range were skipped: [${invalidIndices.join(', ')}]. ` +
        `Valid range: 0–${optimized.length - 1}.`
    ];
  }

  return textResult(JSON.stringify(response, null, 2));
}
