import { describe, test, expect } from 'bun:test';
import { analyzeUrl, analyzeHtml, analyzeSvgs, processSvgBatch } from '../../src/core/analyzer';
import type { SvgData } from '../../src/core/types';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const HOME_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <!-- home icon -->
  <metadata>icon metadata</metadata>
  <g><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"></path></g>
</svg>`;

const ARROW_SVG = `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
  <!-- arrow icon -->
  <metadata>icon metadata</metadata>
  <g><path d="M8 0L0 8h5v8h6V8h5z"></path></g>
</svg>`;

function makeSvgData(html: string, attrs: Partial<{ class: string; id: string; viewBox: string }> = {}): SvgData {
  return {
    html,
    attributes: {
      class: attrs.class ?? null,
      id: attrs.id ?? null,
      width: null,
      height: null,
      viewBox: attrs.viewBox ?? null
    }
  };
}

const HTML_WITH_ONE_SVG = `<html><body>${HOME_SVG}</body></html>`;

const HTML_WITH_TWO_IDENTICAL = `<html><body>
  <svg class="a" viewBox="0 0 24 24"><g><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"></path></g></svg>
  <svg class="b" viewBox="0 0 24 24"><g><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"></path></g></svg>
</body></html>`;

const HTML_WITH_MIXED = `<html><body>
  ${HOME_SVG}
  ${ARROW_SVG}
</body></html>`;

// ---------------------------------------------------------------------------
// analyzeHtml
// ---------------------------------------------------------------------------

describe('analyzeHtml', () => {
  test('returns a FullAnalysis object with required keys', async () => {
    const result = await analyzeHtml(HTML_WITH_ONE_SVG);
    expect(result).toHaveProperty('source');
    expect(result).toHaveProperty('svgs');
    expect(result).toHaveProperty('stats');
    expect(result).toHaveProperty('optimized');
  });

  test('source is empty string when not provided', async () => {
    const result = await analyzeHtml(HTML_WITH_ONE_SVG);
    expect(result.source).toBe('');
  });

  test('source reflects the label passed as second argument', async () => {
    const result = await analyzeHtml(HTML_WITH_ONE_SVG, 'my-source');
    expect(result.source).toBe('my-source');
  });

  test('svgs array length matches number of inline SVGs in HTML', async () => {
    const result = await analyzeHtml(HTML_WITH_MIXED);
    expect(result.svgs).toHaveLength(2);
  });

  test('optimized array length equals svgs array length', async () => {
    const result = await analyzeHtml(HTML_WITH_MIXED);
    expect(result.optimized).toHaveLength(result.svgs.length);
  });

  test('each optimized entry has original, optimized, originalSize, optimizedSize, savingsPercent', async () => {
    const result = await analyzeHtml(HTML_WITH_ONE_SVG);
    const entry = result.optimized[0];
    expect(entry).toHaveProperty('original');
    expect(entry).toHaveProperty('optimized');
    expect(entry).toHaveProperty('originalSize');
    expect(entry).toHaveProperty('optimizedSize');
    expect(entry).toHaveProperty('savingsPercent');
  });

  test('optimized[i].original matches the raw SVG markup from the page', async () => {
    const result = await analyzeHtml(HTML_WITH_ONE_SVG);
    // The original field should be the actual SVG html extracted
    expect(result.optimized[0].original).toBe(result.svgs[0].html);
  });

  test('returns savings data — verbose SVG should be reducible', async () => {
    const result = await analyzeHtml(HTML_WITH_ONE_SVG);
    expect(result.optimized[0].optimizedSize).toBeLessThan(result.optimized[0].originalSize);
  });

  test('stats.totalOriginalSize equals sum of individual originalSizes', async () => {
    const result = await analyzeHtml(HTML_WITH_MIXED);
    const expected = result.optimized.reduce((sum, o) => sum + o.originalSize, 0);
    expect(result.stats.totalOriginalSize).toBe(expected);
  });

  test('detects duplicates when class-only variants of same SVG are present', async () => {
    const result = await analyzeHtml(HTML_WITH_TWO_IDENTICAL);
    const dupCount = Object.keys(result.stats.duplicates).length;
    expect(dupCount).toBeGreaterThan(0);
  });

  test('handles empty HTML — no SVGs found', async () => {
    const result = await analyzeHtml('<html><body><p>nothing</p></body></html>');
    expect(result.svgs).toHaveLength(0);
    expect(result.optimized).toHaveLength(0);
    expect(result.stats.totalOriginalSize).toBe(0);
  });

  test('does not expose _optimizedContent on optimized entries (internal fields stripped)', async () => {
    const result = await analyzeHtml(HTML_WITH_ONE_SVG);
    // Internal fields should not bleed into optimized array items
    expect(result.optimized[0]).not.toHaveProperty('_optimizedContent');
    expect(result.optimized[0]).not.toHaveProperty('_optimizeError');
  });
});

// ---------------------------------------------------------------------------
// analyzeUrl — local file variant
// ---------------------------------------------------------------------------

describe('analyzeUrl (local file)', () => {
  test('resolves a local HTML file and returns FullAnalysis', async () => {
    const filePath = join(import.meta.dir, '../test-svgs.html');
    const result = await analyzeUrl(filePath);
    expect(result.svgs.length).toBeGreaterThan(0);
    expect(result.optimized.length).toBe(result.svgs.length);
  });

  test('source field reflects the input file path', async () => {
    const filePath = join(import.meta.dir, '../test-svgs.html');
    const result = await analyzeUrl(filePath);
    expect(result.source).toBe(filePath);
  });

  test('throws when file does not exist', async () => {
    await expect(analyzeUrl('/nonexistent/path/file.html')).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// analyzeSvgs — unit tests for the analysis pipeline
// ---------------------------------------------------------------------------

describe('analyzeSvgs', () => {
  const svgA = makeSvgData(HOME_SVG, { viewBox: '0 0 24 24' });
  const svgB = makeSvgData(ARROW_SVG, { viewBox: '0 0 16 16' });
  // Duplicate: same SVG as A, different class — hash should match A
  const svgADup = makeSvgData(
    HOME_SVG.replace('viewBox="0 0 24 24"', 'class="dup" viewBox="0 0 24 24"'),
    { class: 'dup', viewBox: '0 0 24 24' }
  );

  test('returns an AnalysisResult with required keys', async () => {
    const result = await analyzeSvgs([svgA]);
    expect(result).toHaveProperty('totalOriginalSize');
    expect(result).toHaveProperty('totalOptimizedSize');
    expect(result).toHaveProperty('svgStats');
    expect(result).toHaveProperty('duplicates');
  });

  test('svgStats has one entry per SVG', async () => {
    const result = await analyzeSvgs([svgA, svgB]);
    expect(result.svgStats).toHaveLength(2);
  });

  test('totalOriginalSize is positive for non-empty input', async () => {
    const result = await analyzeSvgs([svgA]);
    expect(result.totalOriginalSize).toBeGreaterThan(0);
  });

  test('totalOptimizedSize <= totalOriginalSize', async () => {
    const result = await analyzeSvgs([svgA, svgB]);
    expect(result.totalOptimizedSize).toBeLessThanOrEqual(result.totalOriginalSize);
  });

  test('detects a duplicate pair', async () => {
    const result = await analyzeSvgs([svgA, svgADup]);
    expect(Object.keys(result.duplicates).length).toBe(1);
    const group = Object.values(result.duplicates)[0];
    expect(group).toHaveLength(2);
  });

  test('isDuplicate flag set on second occurrence', async () => {
    const result = await analyzeSvgs([svgA, svgADup]);
    const dupStat = result.svgStats.find(s => s.isDuplicate);
    expect(dupStat).toBeDefined();
    expect(dupStat!.index).toBe(1);
  });

  test('no duplicates detected for distinct SVGs', async () => {
    const result = await analyzeSvgs([svgA, svgB]);
    expect(Object.keys(result.duplicates).length).toBe(0);
  });

  test('handles empty input array', async () => {
    const result = await analyzeSvgs([]);
    expect(result.svgStats).toHaveLength(0);
    expect(result.totalOriginalSize).toBe(0);
    expect(result.totalOptimizedSize).toBe(0);
  });

  test('onProgress callback is called for large batches', async () => {
    const progressValues: number[] = [];
    // Build 25 SVGs to exceed the 20-SVG threshold for progress reporting
    const largeBatch: SvgData[] = Array.from({ length: 25 }, () => svgA);
    await analyzeSvgs(largeBatch, pct => progressValues.push(pct));
    expect(progressValues.length).toBeGreaterThan(0);
    expect(progressValues[progressValues.length - 1]).toBe(100);
  });

  test('onProgress is NOT called for small batches (≤20 SVGs)', async () => {
    const progressValues: number[] = [];
    const smallBatch: SvgData[] = Array.from({ length: 5 }, () => svgA);
    await analyzeSvgs(smallBatch, pct => progressValues.push(pct));
    expect(progressValues).toHaveLength(0);
  });

  test('internal _optimizedContent fields are populated on svgStats', async () => {
    const result = await analyzeSvgs([svgA]);
    // Internal field should exist for use by analyzeHtml pipeline
    expect(result.svgStats[0]._optimizedContent).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// processSvgBatch
// ---------------------------------------------------------------------------

describe('processSvgBatch', () => {
  test('assigns sequential indices starting from startIndex', async () => {
    const batch = [makeSvgData(HOME_SVG), makeSvgData(ARROW_SVG)];
    const results = await processSvgBatch(batch, 5);
    expect(results[0].index).toBe(5);
    expect(results[1].index).toBe(6);
  });

  test('populates _optimizedContent from SVGO result', async () => {
    const batch = [makeSvgData(HOME_SVG)];
    const results = await processSvgBatch(batch, 0);
    expect(results[0]._optimizedContent).toBeDefined();
    expect(typeof results[0]._optimizedContent).toBe('string');
  });

  test('sets _optimizeError on SVGO failure', async () => {
    const badSvg = makeSvgData('<svg><bad');
    const results = await processSvgBatch([badSvg], 0);
    expect(results[0]._optimizeError).toBeDefined();
  });
});
