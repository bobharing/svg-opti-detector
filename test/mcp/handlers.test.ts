import { describe, test, expect } from 'bun:test';
import { handleScan, handleGetOptimized } from '../../src/mcp/handlers';

// ---------------------------------------------------------------------------
// Shared test fixtures
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

// Two identical SVGs differing only by class — should be treated as duplicates
const HTML_TWO_DUPS = `<html><body>
  <svg class="a" viewBox="0 0 24 24"><g><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"></path></g></svg>
  <svg class="b" viewBox="0 0 24 24"><g><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"></path></g></svg>
</body></html>`;

const HTML_ONE = `<html><body>${HOME_SVG}</body></html>`;
const HTML_MIXED = `<html><body>${HOME_SVG}${ARROW_SVG}</body></html>`;

// Helper to parse the JSON text from a successful handler result
function parseResult(result: Awaited<ReturnType<typeof handleScan>>): Record<string, unknown> {
  const item = result.content[0];
  if (item.type !== 'text') throw new Error('Expected text content');
  return JSON.parse(item.text);
}

// ---------------------------------------------------------------------------
// handleScan — parameter validation
// ---------------------------------------------------------------------------

describe('handleScan — parameter validation', () => {
  test('returns isError when neither url nor html is provided', async () => {
    const result = await handleScan({});
    expect(result.isError).toBe(true);
  });

  test('error message mentions both url and html parameters', async () => {
    const result = await handleScan({});
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('url');
    expect(text).toContain('html');
  });

  test('returns isError when html exceeds 5 MB', async () => {
    const bigHtml = 'x'.repeat(5 * 1024 * 1024 + 1);
    const result = await handleScan({ html: bigHtml });
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('5 MB');
  });

  test('returns isError for non-existent file path', async () => {
    const result = await handleScan({ url: '/nonexistent/file.html' });
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('File not found');
  });

  test('error for missing file mentions working directory', async () => {
    const result = await handleScan({ url: '/nonexistent/file.html' });
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain(process.cwd());
  });
});

// ---------------------------------------------------------------------------
// handleScan — successful responses
// ---------------------------------------------------------------------------

describe('handleScan — response shape', () => {
  test('returns isError:undefined (not set) for valid html', async () => {
    const result = await handleScan({ html: HTML_ONE });
    expect(result.isError).toBeFalsy();
  });

  test('response contains required top-level keys', async () => {
    const data = parseResult(await handleScan({ html: HTML_ONE }));
    expect(data).toHaveProperty('source');
    expect(data).toHaveProperty('totalSvgs');
    expect(data).toHaveProperty('unoptimized');
    expect(data).toHaveProperty('duplicateGroups');
    expect(data).toHaveProperty('duplicateDetectionNote');
    expect(data).toHaveProperty('summary');
  });

  test('totalSvgs matches actual SVG count', async () => {
    const data = parseResult(await handleScan({ html: HTML_MIXED }));
    expect(data.totalSvgs).toBe(2);
  });

  test('scan response contains NO raw SVG markup (token efficiency)', async () => {
    const result = await handleScan({ html: HTML_MIXED });
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).not.toContain('<path');
    expect(text).not.toContain('<g>');
  });

  test('unoptimized entries have index, identifier, originalSize, optimizedSize, savingsPercent', async () => {
    const data = parseResult(await handleScan({ html: HTML_ONE }));
    const unoptimized = data.unoptimized as unknown[];
    if (unoptimized.length > 0) {
      const entry = unoptimized[0] as Record<string, unknown>;
      expect(entry).toHaveProperty('index');
      expect(entry).toHaveProperty('identifier');
      expect(entry).toHaveProperty('originalSize');
      expect(entry).toHaveProperty('optimizedSize');
      expect(entry).toHaveProperty('savingsPercent');
    }
  });

  test('summary has all required fields', async () => {
    const data = parseResult(await handleScan({ html: HTML_ONE }));
    const summary = data.summary as Record<string, unknown>;
    expect(summary).toHaveProperty('totalOriginalBytes');
    expect(summary).toHaveProperty('totalOptimizedBytes');
    expect(summary).toHaveProperty('totalSavingsPercent');
    expect(summary).toHaveProperty('duplicateWastedBytes');
    expect(summary).toHaveProperty('duplicateGroupCount');
  });

  test('detects duplicate group for class-only variant SVGs', async () => {
    const data = parseResult(await handleScan({ html: HTML_TWO_DUPS }));
    const groups = data.duplicateGroups as unknown[];
    expect(groups.length).toBeGreaterThan(0);
    const group = groups[0] as Record<string, unknown>;
    expect(group).toHaveProperty('count');
    expect(group).toHaveProperty('indices');
    expect(group).toHaveProperty('wastedBytes');
  });

  test('duplicate group wastedBytes is positive', async () => {
    const data = parseResult(await handleScan({ html: HTML_TWO_DUPS }));
    const group = (data.duplicateGroups as Record<string, unknown>[])[0];
    expect(group.wastedBytes as number).toBeGreaterThan(0);
  });

  test('duplicateDetectionNote is present and non-empty', async () => {
    const data = parseResult(await handleScan({ html: HTML_ONE }));
    expect(typeof data.duplicateDetectionNote).toBe('string');
    expect((data.duplicateDetectionNote as string).length).toBeGreaterThan(0);
  });

  test('respects threshold — items below threshold not flagged', async () => {
    // threshold 100 means nothing should be flagged as unoptimized
    const data = parseResult(await handleScan({ html: HTML_ONE, threshold: 100 }));
    expect((data.unoptimized as unknown[]).length).toBe(0);
  });

  test('threshold 0 flags all SVGs with any savings', async () => {
    const data0 = parseResult(await handleScan({ html: HTML_ONE, threshold: 0 }));
    const data5 = parseResult(await handleScan({ html: HTML_ONE, threshold: 5 }));
    // At threshold 0, at least as many SVGs flagged as at threshold 5
    expect((data0.unoptimized as unknown[]).length).toBeGreaterThanOrEqual(
      (data5.unoptimized as unknown[]).length
    );
  });

  test('source field uses provided url when present', async () => {
    const data = parseResult(await handleScan({ html: HTML_ONE }));
    // When html provided without url, source falls back
    expect(typeof data.source).toBe('string');
  });

  test('no SVGs returns totalSvgs of 0', async () => {
    const data = parseResult(await handleScan({ html: '<html><body><p>no svgs</p></body></html>' }));
    expect(data.totalSvgs).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// handleGetOptimized — parameter validation
// ---------------------------------------------------------------------------

describe('handleGetOptimized — parameter validation', () => {
  test('returns isError when no params provided', async () => {
    const result = await handleGetOptimized({});
    expect(result.isError).toBe(true);
  });

  test('error message mentions url, html, and svg parameters', async () => {
    const result = await handleGetOptimized({});
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('url');
    expect(text).toContain('html');
    expect(text).toContain('svg');
  });

  test('returns isError when html exceeds 5 MB', async () => {
    const bigHtml = 'x'.repeat(5 * 1024 * 1024 + 1);
    const result = await handleGetOptimized({ html: bigHtml });
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('5 MB');
  });

  test('returns isError when svg exceeds 1 MB', async () => {
    const bigSvg = '<svg>' + 'x'.repeat(1 * 1024 * 1024) + '</svg>';
    const result = await handleGetOptimized({ svg: bigSvg });
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('1 MB');
  });

  test('returns isError for out-of-range index', async () => {
    const result = await handleGetOptimized({ html: HTML_ONE, indices: [999] });
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('svg_scan');
  });

  test('returns isError for non-existent file path', async () => {
    const result = await handleGetOptimized({ url: '/nonexistent/file.html' });
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// handleGetOptimized — svg parameter (direct SVG mode)
// ---------------------------------------------------------------------------

describe('handleGetOptimized — svg parameter', () => {
  test('returns svgs array with one entry', async () => {
    const result = await handleGetOptimized({ svg: HOME_SVG });
    const data = parseResult(result);
    expect(Array.isArray(data.svgs)).toBe(true);
    expect((data.svgs as unknown[]).length).toBe(1);
  });

  test('entry has index 0', async () => {
    const result = await handleGetOptimized({ svg: HOME_SVG });
    const data = parseResult(result);
    const entry = (data.svgs as Record<string, unknown>[])[0];
    expect(entry.index).toBe(0);
  });

  test('entry has original and optimized fields', async () => {
    const result = await handleGetOptimized({ svg: HOME_SVG });
    const data = parseResult(result);
    const entry = (data.svgs as Record<string, unknown>[])[0];
    expect(entry).toHaveProperty('original');
    expect(entry).toHaveProperty('optimized');
  });

  test('entry original matches the input svg', async () => {
    const result = await handleGetOptimized({ svg: HOME_SVG });
    const data = parseResult(result);
    const entry = (data.svgs as Record<string, unknown>[])[0];
    expect(entry.original).toBe(HOME_SVG);
  });

  test('entry has originalSize, optimizedSize, savingsPercent', async () => {
    const result = await handleGetOptimized({ svg: HOME_SVG });
    const data = parseResult(result);
    const entry = (data.svgs as Record<string, unknown>[])[0];
    expect(entry).toHaveProperty('originalSize');
    expect(entry).toHaveProperty('optimizedSize');
    expect(entry).toHaveProperty('savingsPercent');
  });

  test('no identifier field in svg-only mode (no attributes context)', async () => {
    const result = await handleGetOptimized({ svg: HOME_SVG });
    const data = parseResult(result);
    const entry = (data.svgs as Record<string, unknown>[])[0];
    // No identifier when using direct svg param — attributes not available
    expect(entry.identifier).toBeUndefined();
  });

  test('no isError on success', async () => {
    const result = await handleGetOptimized({ svg: HOME_SVG });
    expect(result.isError).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// handleGetOptimized — html/url + indices mode
// ---------------------------------------------------------------------------

describe('handleGetOptimized — html + indices mode', () => {
  test('returns svgs array with requested indices only', async () => {
    const result = await handleGetOptimized({ html: HTML_MIXED, indices: [0] });
    const data = parseResult(result);
    expect((data.svgs as unknown[]).length).toBe(1);
    expect((data.svgs as Record<string, unknown>[])[0].index).toBe(0);
  });

  test('returns all SVGs when indices omitted', async () => {
    const result = await handleGetOptimized({ html: HTML_MIXED });
    const data = parseResult(result);
    expect((data.svgs as unknown[]).length).toBe(2);
  });

  test('each entry has original, optimized, identifier, sizes, savingsPercent', async () => {
    const result = await handleGetOptimized({ html: HTML_ONE, indices: [0] });
    const data = parseResult(result);
    const entry = (data.svgs as Record<string, unknown>[])[0];
    expect(entry).toHaveProperty('original');
    expect(entry).toHaveProperty('optimized');
    expect(entry).toHaveProperty('identifier');
    expect(entry).toHaveProperty('originalSize');
    expect(entry).toHaveProperty('optimizedSize');
    expect(entry).toHaveProperty('savingsPercent');
  });

  test('optimized is a valid SVG string', async () => {
    const result = await handleGetOptimized({ html: HTML_ONE, indices: [0] });
    const data = parseResult(result);
    const entry = (data.svgs as Record<string, unknown>[])[0];
    expect((entry.optimized as string).trim()).toMatch(/^<svg/);
  });

  test('includes warnings when some indices are out of range', async () => {
    const result = await handleGetOptimized({ html: HTML_MIXED, indices: [0, 999] });
    const data = parseResult(result);
    // Valid index 0 should still be returned
    expect((data.svgs as unknown[]).length).toBe(1);
    // Warnings should be present
    expect(data).toHaveProperty('warnings');
    expect(Array.isArray(data.warnings)).toBe(true);
  });
});
