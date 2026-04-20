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
 * Returns a bounded summary: totals, top 5 unoptimized offenders, top 5 duplicate groups.
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

  // Build unoptimized list sorted by savings descending
  const allUnoptimized: Array<{
    index: number;
    originalSize: number;
    optimizedSize: number;
    savingsPercent: number;
  }> = [];

  for (const stat of stats.svgStats) {
    if (!stat._optimizeError) {
      const savingsPercent =
        stat.originalSize > 0
          ? ((stat.originalSize - stat.optimizedSize) / stat.originalSize) * 100
          : 0;
      const rounded = Math.round(savingsPercent * 10) / 10;
      if (rounded >= threshold) {
        allUnoptimized.push({
          index: stat.index,
          originalSize: stat.originalSize,
          optimizedSize: stat.optimizedSize,
          savingsPercent: rounded
        });
      }
    }
  }
  allUnoptimized.sort((a, b) => b.savingsPercent - a.savingsPercent);

  // Build duplicate groups sorted by wasted bytes descending
  const allDuplicateGroups: Array<{
    count: number;
    indices: number[];
    wastedBytes: number;
  }> = [];
  let totalDuplicateWastedBytes = 0;

  for (const [, indices] of Object.entries(stats.duplicates)) {
    const firstStat = stats.svgStats[indices[0]];
    const wastedBytes = (indices.length - 1) * firstStat.originalSize;
    totalDuplicateWastedBytes += wastedBytes;
    allDuplicateGroups.push({ count: indices.length, indices, wastedBytes });
  }
  allDuplicateGroups.sort((a, b) => b.wastedBytes - a.wastedBytes);

  const totalSavingsPercent =
    stats.totalOriginalSize > 0
      ? ((stats.totalOriginalSize - stats.totalOptimizedSize) / stats.totalOriginalSize) * 100
      : 0;

  const response = {
    source: source || args.url || '<html input>',
    totalSvgs: svgs.length,
    unoptimized: {
      count: allUnoptimized.length,
      topOffenders: allUnoptimized.slice(0, 5)
    },
    duplicates: {
      groupCount: allDuplicateGroups.length,
      totalWastedBytes: totalDuplicateWastedBytes,
      topGroups: allDuplicateGroups.slice(0, 5)
    },
    summary: {
      totalOriginalBytes: stats.totalOriginalSize,
      totalOptimizedBytes: stats.totalOptimizedSize,
      totalSavingsPercent: Math.round(totalSavingsPercent * 10) / 10
    }
  };

  return textResult(JSON.stringify(response, null, 2));
}

// ---------------------------------------------------------------------------
// svg_list handler
// ---------------------------------------------------------------------------

export interface ListArgs {
  url?: string;
  html?: string;
  threshold?: number;
  type?: 'unoptimized' | 'duplicates' | 'all';
  minSavingsPercent?: number;
  minOriginalSize?: number;
  limit?: number;
  offset?: number;
}

/**
 * Pure handler for the svg_list tool.
 * Returns a paginated, filtered list of unoptimized SVGs or duplicate groups.
 */
export async function handleList(args: ListArgs): Promise<CallToolResult> {
  if (!args.url && !args.html) {
    return errorResult(
      "Either 'url' or 'html' parameter is required. " +
        'Provide a URL (https://...), absolute file path (/path/to/file.html), ' +
        'or raw HTML string via the html parameter.'
    );
  }

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
  const type = args.type ?? 'all';
  const limit = Math.min(Math.max(args.limit ?? 20, 1), 100);
  const offset = Math.max(args.offset ?? 0, 0);

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
  const src = source || args.url || '<html input>';

  const buildUnoptimizedItems = () => {
    const items: Array<{
      index: number;
      identifier: string;
      originalSize: number;
      optimizedSize: number;
      savingsPercent: number;
    }> = [];

    for (const stat of stats.svgStats) {
      if (stat._optimizeError) continue;
      const savingsPercent =
        stat.originalSize > 0
          ? ((stat.originalSize - stat.optimizedSize) / stat.originalSize) * 100
          : 0;
      const rounded = Math.round(savingsPercent * 10) / 10;
      if (rounded < threshold) continue;
      if (args.minSavingsPercent !== undefined && rounded < args.minSavingsPercent) continue;
      if (args.minOriginalSize !== undefined && stat.originalSize < args.minOriginalSize) continue;
      items.push({
        index: stat.index,
        identifier: generateIdentifier(svgs[stat.index].attributes),
        originalSize: stat.originalSize,
        optimizedSize: stat.optimizedSize,
        savingsPercent: rounded
      });
    }
    items.sort((a, b) => b.savingsPercent - a.savingsPercent);
    return items;
  };

  const buildDuplicateGroups = () => {
    const groups: Array<{
      count: number;
      indices: number[];
      wastedBytes: number;
      identifier: string;
    }> = [];

    for (const [, indices] of Object.entries(stats.duplicates)) {
      const firstIndex = indices[0];
      const firstStat = stats.svgStats[firstIndex];
      if (args.minOriginalSize !== undefined && firstStat.originalSize < args.minOriginalSize) continue;
      const wastedBytes = (indices.length - 1) * firstStat.originalSize;
      groups.push({
        count: indices.length,
        indices,
        wastedBytes,
        identifier: generateIdentifier(svgs[firstIndex].attributes)
      });
    }
    groups.sort((a, b) => b.wastedBytes - a.wastedBytes);
    return groups;
  };

  if (type === 'unoptimized') {
    const allItems = buildUnoptimizedItems();
    const page = allItems.slice(offset, offset + limit);
    return textResult(JSON.stringify({
      source: src,
      type: 'unoptimized',
      total: allItems.length,
      offset,
      limit,
      hasMore: offset + limit < allItems.length,
      items: page
    }, null, 2));
  }

  if (type === 'duplicates') {
    const allGroups = buildDuplicateGroups();
    const page = allGroups.slice(offset, offset + limit);
    return textResult(JSON.stringify({
      source: src,
      type: 'duplicates',
      total: allGroups.length,
      offset,
      limit,
      hasMore: offset + limit < allGroups.length,
      groups: page
    }, null, 2));
  }

  // type === 'all'
  const allItems = buildUnoptimizedItems();
  const allGroups = buildDuplicateGroups();
  return textResult(JSON.stringify({
    source: src,
    type: 'all',
    unoptimized: {
      total: allItems.length,
      offset,
      limit,
      hasMore: offset + limit < allItems.length,
      items: allItems.slice(offset, offset + limit)
    },
    duplicates: {
      total: allGroups.length,
      offset,
      limit,
      hasMore: offset + limit < allGroups.length,
      groups: allGroups.slice(offset, offset + limit)
    }
  }, null, 2));
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
