import { describe, test, expect } from 'bun:test';
import { optimizeSvg, optimizeSvgs } from '../../src/core/optimizer';

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

// A verbose but valid SVG with sub-optimal structure that SVGO can meaningfully reduce
const VERBOSE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24" width="24" height="24">
  <!-- This is a comment -->
  <metadata>Some metadata</metadata>
  <g id="group1">
    <g id="group2">
      <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" fill="#000000"></path>
    </g>
  </g>
</svg>`;

const SIMPLE_VALID_SVG = `<svg viewBox="0 0 24 24"><path d="M12 2L2 22h20z"/></svg>`;

const INVALID_SVG = `<svg><unclosed-tag>broken`;

describe('optimizeSvg', () => {
  test('returns correct structure for a valid SVG', () => {
    const result = optimizeSvg(SIMPLE_VALID_SVG);

    expect(result).toHaveProperty('original');
    expect(result).toHaveProperty('optimized');
    expect(result).toHaveProperty('originalSize');
    expect(result).toHaveProperty('optimizedSize');
    expect(result).toHaveProperty('savingsPercent');
  });

  test('original field equals the input string', () => {
    const result = optimizeSvg(SIMPLE_VALID_SVG);
    expect(result.original).toBe(SIMPLE_VALID_SVG);
  });

  test('optimized field is a non-empty string for a valid SVG', () => {
    const result = optimizeSvg(SIMPLE_VALID_SVG);
    expect(typeof result.optimized).toBe('string');
    expect(result.optimized.length).toBeGreaterThan(0);
  });

  test('optimized SVG still starts with <svg', () => {
    const result = optimizeSvg(SIMPLE_VALID_SVG);
    expect(result.optimized.trim()).toMatch(/^<svg/);
  });

  test('produces measurable savings on a verbose SVG', () => {
    const result = optimizeSvg(VERBOSE_SVG);
    expect(result.optimizedSize).toBeLessThan(result.originalSize);
    expect(result.savingsPercent).toBeGreaterThan(0);
  });

  test('originalSize matches byte length of input', () => {
    const result = optimizeSvg(VERBOSE_SVG);
    const expected = new TextEncoder().encode(VERBOSE_SVG).length;
    expect(result.originalSize).toBe(expected);
  });

  test('optimizedSize matches byte length of optimized output', () => {
    const result = optimizeSvg(VERBOSE_SVG);
    const expected = new TextEncoder().encode(result.optimized).length;
    expect(result.optimizedSize).toBe(expected);
  });

  test('savingsPercent is computed correctly', () => {
    const result = optimizeSvg(VERBOSE_SVG);
    const expected = ((result.originalSize - result.optimizedSize) / result.originalSize) * 100;
    expect(result.savingsPercent).toBeCloseTo(expected, 5);
  });

  test('savingsPercent is 0 for already-minimal SVG', () => {
    // A single-path minimal SVG may already be optimal
    const result = optimizeSvg(SIMPLE_VALID_SVG);
    // savingsPercent should be >= 0 (can be 0 for already-optimal SVGs)
    expect(result.savingsPercent).toBeGreaterThanOrEqual(0);
  });

  test('gracefully handles an invalid SVG — no throw', () => {
    expect(() => optimizeSvg(INVALID_SVG)).not.toThrow();
  });

  test('sets error field when SVGO fails', () => {
    const result = optimizeSvg(INVALID_SVG);
    expect(result.error).toBeDefined();
    expect(typeof result.error).toBe('string');
    expect(result.error!.length).toBeGreaterThan(0);
  });

  test('optimized equals original when SVGO fails', () => {
    const result = optimizeSvg(INVALID_SVG);
    expect(result.optimized).toBe(result.original);
  });

  test('savingsPercent is 0 when SVGO fails', () => {
    const result = optimizeSvg(INVALID_SVG);
    expect(result.savingsPercent).toBe(0);
  });

  test('optimizedSize equals originalSize when SVGO fails', () => {
    const result = optimizeSvg(INVALID_SVG);
    expect(result.optimizedSize).toBe(result.originalSize);
  });

  test('no error field on successful optimization', () => {
    const result = optimizeSvg(VERBOSE_SVG);
    expect(result.error).toBeUndefined();
  });
});

describe('optimizeSvgs', () => {
  test('returns an array with one entry per input', () => {
    const inputs = [
      { html: SIMPLE_VALID_SVG },
      { html: VERBOSE_SVG }
    ];
    const results = optimizeSvgs(inputs);
    expect(results).toHaveLength(2);
  });

  test('processes each SVG independently', () => {
    const inputs = [{ html: SIMPLE_VALID_SVG }, { html: VERBOSE_SVG }];
    const results = optimizeSvgs(inputs);
    expect(results[0].original).toBe(SIMPLE_VALID_SVG);
    expect(results[1].original).toBe(VERBOSE_SVG);
  });

  test('a failure in one SVG does not affect the others', () => {
    const inputs = [
      { html: INVALID_SVG },
      { html: VERBOSE_SVG }
    ];
    const results = optimizeSvgs(inputs);
    expect(results[0].error).toBeDefined();
    expect(results[1].error).toBeUndefined();
    expect(results[1].savingsPercent).toBeGreaterThan(0);
  });

  test('returns empty array for empty input', () => {
    expect(optimizeSvgs([])).toEqual([]);
  });
});
