import { hashSvg } from './hasher';
import { optimizeSvg } from './optimizer';
import { fetchHtml } from './fetcher';
import { extractInlineSvgs } from './parser';
import type { SvgData, SvgProcessResult, AnalysisResult } from './types';
import type { OptimizedSvg } from './optimizer';

/**
 * Full analysis result combining stats, SVG data, and per-SVG optimization content.
 * Returned by analyzeUrl() and analyzeHtml() for use by MCP handlers.
 */
export interface FullAnalysis {
  source: string;
  svgs: SvgData[];
  stats: AnalysisResult;
  optimized: OptimizedSvg[];
}

/**
 * Process a batch of SVGs in parallel.
 * Uses optimizer.ts as the sole owner of SVGO calls — no direct optimize() calls here.
 * Internal _optimizedContent and _optimizeError fields are set on each result for use
 * by analyzeUrl/analyzeHtml without a second SVGO pass.
 */
export async function processSvgBatch(
  svgBatch: SvgData[],
  startIndex: number
): Promise<SvgProcessResult[]> {
  return await Promise.all(
    svgBatch.map(async (svg, batchIndex) => {
      const index = startIndex + batchIndex;
      const optimResult = optimizeSvg(svg.html);
      const hash = hashSvg(svg.html);

      const result: SvgProcessResult = {
        index,
        originalSize: optimResult.originalSize,
        optimizedSize: optimResult.optimizedSize,
        hash,
        isDuplicate: false,
        _optimizedContent: optimResult.optimized
      };

      if (optimResult.error) {
        result._optimizeError = optimResult.error;
      }

      return result;
    })
  );
}

/**
 * Analyzes a collection of SVGs for optimization potential and duplicates.
 * @param svgs - Array of SVG data
 * @param onProgress - Optional callback receiving progress percent (0-100), called only when > 20 SVGs
 * @returns Analysis results
 */
export async function analyzeSvgs(
  svgs: SvgData[],
  onProgress?: (percent: number) => void
): Promise<AnalysisResult> {
  let totalOriginalSize = 0;
  let totalOptimizedSize = 0;
  const svgStats: SvgProcessResult[] = [];
  const hashMap = new Map<string, number>();
  const duplicates: Record<string, number[]> = {};

  // Process SVGs in batches of 50
  const batchSize = 50;
  const batches: SvgData[][] = [];

  for (let i = 0; i < svgs.length; i += batchSize) {
    batches.push(svgs.slice(i, i + batchSize));
  }

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    const startIndex = batchIndex * batchSize;

    const batchResults = await processSvgBatch(batch, startIndex);

    batchResults.forEach(result => {
      totalOriginalSize += result.originalSize;
      totalOptimizedSize += result.optimizedSize;

      if (hashMap.has(result.hash)) {
        result.isDuplicate = true;
        if (!duplicates[result.hash]) {
          duplicates[result.hash] = [hashMap.get(result.hash)!];
        }
        duplicates[result.hash].push(result.index);
      } else {
        hashMap.set(result.hash, result.index);
      }

      svgStats.push(result);
    });

    if (onProgress && svgs.length > 20) {
      const percent = Math.round(((batchIndex + 1) / batches.length) * 100);
      onProgress(percent);
    }
  }

  return {
    totalOriginalSize,
    totalOptimizedSize,
    svgStats,
    duplicates
  };
}

/**
 * Fetches HTML from a URL or file path, then runs the full analysis pipeline.
 * Returns structured data including per-SVG optimized content with no double SVGO calls.
 */
export async function analyzeUrl(url: string): Promise<FullAnalysis> {
  const html = await fetchHtml(url);
  return analyzeHtml(html, url);
}

/**
 * Runs the full analysis pipeline on an HTML string.
 * Extracts optimized content from the single SVGO pass in analyzeSvgs — no second call.
 * @param html - Raw HTML string
 * @param source - Optional label for the source (URL or file path) included in the result
 */
export async function analyzeHtml(html: string, source: string = ''): Promise<FullAnalysis> {
  const svgs = extractInlineSvgs(html);
  const stats = await analyzeSvgs(svgs);

  // Extract optimized content from internal fields set by processSvgBatch.
  // This avoids a second SVGO call — data is already computed.
  const optimized: OptimizedSvg[] = stats.svgStats.map((stat, i) => {
    const result: OptimizedSvg = {
      original: svgs[i].html,
      optimized: stat._optimizedContent ?? svgs[i].html,
      originalSize: stat.originalSize,
      optimizedSize: stat.optimizedSize,
      savingsPercent:
        stat.originalSize > 0
          ? ((stat.originalSize - stat.optimizedSize) / stat.originalSize) * 100
          : 0
    };

    if (stat._optimizeError) {
      result.error = stat._optimizeError;
    }

    return result;
  });

  return { source, svgs, stats, optimized };
}
