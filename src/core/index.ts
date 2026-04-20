// Core functions
export { fetchHtml } from './fetcher';
export { extractInlineSvgs } from './parser';
export { hashSvg } from './hasher';
export { analyzeSvgs, processSvgBatch, analyzeUrl, analyzeHtml } from './analyzer';
export { optimizeSvg, optimizeSvgs } from './optimizer';
export { formatBytes, generateIdentifier, stripInternalFields } from './utils';

// Types
export type { SvgData, SvgAttributes, SvgProcessResult, AnalysisResult, CliOptions } from './types';
export type { OptimizedSvg } from './optimizer';
export type { FullAnalysis } from './analyzer';
