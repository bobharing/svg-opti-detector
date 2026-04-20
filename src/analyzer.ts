import { optimize, type Config } from 'svgo';
import { hashSvg } from './hasher';
import type { SvgData, SvgProcessResult, AnalysisResult } from './types';

// Performance optimization: Pre-configure SVGO with common optimizations
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
 * Process a batch of SVGs in parallel
 * @param svgBatch - Batch of SVGs to process
 * @param startIndex - Starting index for this batch
 * @returns Processing results
 */
export async function processSvgBatch(
  svgBatch: SvgData[],
  startIndex: number
): Promise<SvgProcessResult[]> {
  const encoder = new TextEncoder();
  return await Promise.all(
    svgBatch.map(async (svg, batchIndex) => {
      const index = startIndex + batchIndex;
      const originalSize = encoder.encode(svg.html).length;
      
      try {
        const optimized = optimize(svg.html, svgoConfig);
        const optimizedSize = encoder.encode(optimized.data).length;
        const hash = hashSvg(svg.html);
        
        return {
          index,
          originalSize,
          optimizedSize,
          hash,
          isDuplicate: false
        };
      } catch (error) {
        // Fallback if optimization fails
        console.warn(
          `Warning: Failed to optimize SVG #${index}: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        );
        return {
          index,
          originalSize,
          optimizedSize: originalSize,
          hash: hashSvg(svg.html),
          isDuplicate: false
        };
      }
    })
  );
}

/**
 * Analyzes a collection of SVGs for optimization and duplicates
 * @param svgs - Array of SVG data
 * @returns Analysis results
 */
export async function analyzeSvgs(svgs: SvgData[]): Promise<AnalysisResult> {
  let totalOriginalSize = 0;
  let totalOptimizedSize = 0;
  const svgStats: SvgProcessResult[] = [];
  const hashMap = new Map<string, number>(); // Performance optimization: Use Map instead of object
  const duplicates: Record<string, number[]> = {};
  
  // Performance optimization: Process SVGs in batches of 50 (Bun handles concurrency better than Node)
  const batchSize = 50;
  const batches: SvgData[][] = [];
  
  for (let i = 0; i < svgs.length; i += batchSize) {
    batches.push(svgs.slice(i, i + batchSize));
  }
  
  // Process batches sequentially to avoid overwhelming the system
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    const startIndex = batchIndex * batchSize;
    
    const batchResults = await processSvgBatch(batch, startIndex);
    
    // Process results and detect duplicates
    batchResults.forEach(result => {
      totalOriginalSize += result.originalSize;
      totalOptimizedSize += result.optimizedSize;
      
      // Early duplicate detection
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
    
    // Progress indicator for large datasets
    if (svgs.length > 20) {
      const progress = Math.round(((batchIndex + 1) / batches.length) * 100);
      process.stdout.write(`\rProcessing SVGs... ${progress}%`);
    }
  }
  
  if (svgs.length > 20) {
    process.stdout.write('\n');
  }
  
  return {
    totalOriginalSize,
    totalOptimizedSize,
    svgStats,
    duplicates
  };
}
