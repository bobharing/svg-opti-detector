/**
 * SVG attribute types
 */
export interface SvgAttributes {
  class: string | null;
  id: string | null;
  width: string | null;
  height: string | null;
  viewBox: string | null;
}

/**
 * Extracted SVG data
 */
export interface SvgData {
  html: string;
  attributes: SvgAttributes;
}

/**
 * Result of processing a single SVG
 */
export interface SvgProcessResult {
  index: number;
  originalSize: number;
  optimizedSize: number;
  hash: string;
  isDuplicate: boolean;
}

/**
 * Complete analysis result
 */
export interface AnalysisResult {
  totalOriginalSize: number;
  totalOptimizedSize: number;
  svgStats: SvgProcessResult[];
  duplicates: Record<string, number[]>;
}

/**
 * CLI options
 */
export interface CliOptions {
  url: string;
  showDuplicates: boolean;
  sortBySavings: boolean;
}
