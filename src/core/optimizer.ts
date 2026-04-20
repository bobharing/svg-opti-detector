import { optimize, type Config } from 'svgo';

// Single shared SVGO configuration — optimizer.ts is the sole owner of SVGO calls
const svgoConfig: Config = {
  multipass: true,
  plugins: [
    'preset-default',
    'removeDimensions',
    'removeComments',
    'removeMetadata',
    'removeEditorsNSData'
  ] as any // Type assertion for plugin names as strings
};

/**
 * The result of optimizing a single SVG.
 * When `error` is set, `optimized` equals `original` (no change applied).
 */
export interface OptimizedSvg {
  original: string;
  optimized: string;
  originalSize: number;
  optimizedSize: number;
  savingsPercent: number;
  /** Set when SVGO fails for this SVG. `optimized` equals `original` when this is present. */
  error?: string;
}

/**
 * Optimizes a single SVG string via SVGO.
 * Never throws — returns partial result with `error` field on SVGO failure.
 */
export function optimizeSvg(svgHtml: string): OptimizedSvg {
  const encoder = new TextEncoder();
  const originalSize = encoder.encode(svgHtml).length;

  try {
    const result = optimize(svgHtml, svgoConfig);
    const optimizedSize = encoder.encode(result.data).length;
    const savings = originalSize - optimizedSize;
    const savingsPercent = originalSize > 0 ? (savings / originalSize) * 100 : 0;

    return {
      original: svgHtml,
      optimized: result.data,
      originalSize,
      optimizedSize,
      savingsPercent
    };
  } catch (error) {
    return {
      original: svgHtml,
      optimized: svgHtml, // fallback: no change applied
      originalSize,
      optimizedSize: originalSize,
      savingsPercent: 0,
      error: error instanceof Error ? error.message : 'Unknown SVGO error'
    };
  }
}

/**
 * Optimizes an array of SVG objects.
 * Each entry is processed independently — failures do not affect other SVGs.
 */
export function optimizeSvgs(svgs: { html: string }[]): OptimizedSvg[] {
  return svgs.map(svg => optimizeSvg(svg.html));
}
