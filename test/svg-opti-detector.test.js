const {
  extractInlineSvgs,
  hashSvg,
  generateIdentifierString,
  formatBytes,
  processSvgBatch,
  analyzeSvgs
} = require('../svg-opti-detector');

const fs = require('fs');
const path = require('path');

describe('SVG Opti Detector', () => {
  
  describe('extractInlineSvgs', () => {
    test('should extract SVGs from HTML', () => {
      const html = `
        <html>
          <body>
            <svg class="icon" width="24" height="24">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.77 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z"/>
            </svg>
            <svg id="logo" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="40"/>
            </svg>
          </body>
        </html>
      `;
      
      const svgs = extractInlineSvgs(html);
      
      expect(svgs).toHaveLength(2);
      expect(svgs[0].attributes.class).toBe('icon');
      expect(svgs[0].attributes.width).toBe('24');
      expect(svgs[0].attributes.height).toBe('24');
      expect(svgs[1].attributes.id).toBe('logo');
      expect(svgs[1].attributes.viewBox).toBe('0 0 100 100');
    });

    test('should handle HTML with no SVGs', () => {
      const html = '<html><body><div>No SVGs here</div></body></html>';
      const svgs = extractInlineSvgs(html);
      
      expect(svgs).toHaveLength(0);
    });

    test('should extract SVGs with null attributes when not present', () => {
      const html = '<svg><circle cx="10" cy="10" r="5"/></svg>';
      const svgs = extractInlineSvgs(html);
      
      expect(svgs).toHaveLength(1);
      expect(svgs[0].attributes).toEqual({
        class: null,
        id: null,
        width: null,
        height: null,
        viewBox: null
      });
    });
  });

  describe('hashSvg', () => {
    test('should generate consistent hash for identical SVGs', () => {
      const svg1 = '<svg><circle cx="10" cy="10" r="5"/></svg>';
      const svg2 = '<svg><circle cx="10" cy="10" r="5"/></svg>';
      
      const hash1 = hashSvg(svg1);
      const hash2 = hashSvg(svg2);
      
      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe('string');
      expect(hash1).toHaveLength(32); // MD5 hash length
    });

    test('should generate same hash for SVGs with different classes', () => {
      const svg1 = '<svg class="icon-1"><circle cx="10" cy="10" r="5"/></svg>';
      const svg2 = '<svg class="icon-2"><circle cx="10" cy="10" r="5"/></svg>';
      
      const hash1 = hashSvg(svg1);
      const hash2 = hashSvg(svg2);
      
      expect(hash1).toBe(hash2);
    });

    test('should generate different hashes for different SVGs', () => {
      const svg1 = '<svg><circle cx="10" cy="10" r="5"/></svg>';
      const svg2 = '<svg><circle cx="20" cy="20" r="10"/></svg>';
      
      const hash1 = hashSvg(svg1);
      const hash2 = hashSvg(svg2);
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('generateIdentifierString', () => {
    test('should generate identifier string with all attributes', () => {
      const attrs = {
        class: 'icon',
        id: 'my-svg',
        width: '24',
        height: '24',
        viewBox: '0 0 24 24'
      };
      
      const result = generateIdentifierString(attrs);
      
      expect(result).toContain('class="icon"');
      expect(result).toContain('id="my-svg"');
      expect(result).toContain('width="24"');
      expect(result).toContain('height="24"');
      expect(result).toContain('viewBox="0 0 24 24"');
    });

    test('should generate identifier string with only present attributes', () => {
      const attrs = {
        class: 'icon',
        id: null,
        width: '24',
        height: null,
        viewBox: null
      };
      
      const result = generateIdentifierString(attrs);
      
      expect(result).toContain('class="icon"');
      expect(result).toContain('width="24"');
      expect(result).not.toContain('id=');
      expect(result).not.toContain('height=');
      expect(result).not.toContain('viewBox=');
    });

    test('should return empty string when no attributes present', () => {
      const attrs = {
        class: null,
        id: null,
        width: null,
        height: null,
        viewBox: null
      };
      
      const result = generateIdentifierString(attrs);
      
      expect(result).toBe('');
    });
  });

  describe('formatBytes', () => {
    test('should format bytes correctly', () => {
      expect(formatBytes(500)).toBe('500 bytes');
      expect(formatBytes(1024)).toBe('1.00 KB (1024 bytes)');
      expect(formatBytes(2048)).toBe('2.00 KB (2048 bytes)');
      expect(formatBytes(1536)).toBe('1.50 KB (1536 bytes)');
    });

    test('should format kilobytes correctly', () => {
      expect(formatBytes(1024 * 500)).toBe('500.00 KB (512000 bytes)');
      expect(formatBytes(1024 * 1024 - 1)).toBe('1024.00 KB (1048575 bytes)');
    });

    test('should format megabytes correctly', () => {
      expect(formatBytes(1024 * 1024)).toBe('1.00 MB (1048576 bytes)');
      expect(formatBytes(1024 * 1024 * 2.5)).toBe('2.50 MB (2621440 bytes)');
    });

    test('should handle zero bytes', () => {
      expect(formatBytes(0)).toBe('0 bytes');
    });
  });

  describe('processSvgBatch', () => {
    test('should process a batch of SVGs', async () => {
      const svgBatch = [
        {
          html: '<svg><circle cx="10" cy="10" r="5"/></svg>',
          attributes: { class: null, id: null, width: null, height: null, viewBox: null }
        },
        {
          html: '<svg><rect x="0" y="0" width="10" height="10"/></svg>',
          attributes: { class: null, id: null, width: null, height: null, viewBox: null }
        }
      ];

      const results = await processSvgBatch(svgBatch, 0);

      expect(results).toHaveLength(2);
      expect(results[0]).toHaveProperty('index', 0);
      expect(results[0]).toHaveProperty('originalSize');
      expect(results[0]).toHaveProperty('optimizedSize');
      expect(results[0]).toHaveProperty('hash');
      expect(results[0]).toHaveProperty('isDuplicate', false);
      
      expect(results[1]).toHaveProperty('index', 1);
      expect(typeof results[0].originalSize).toBe('number');
      expect(typeof results[0].optimizedSize).toBe('number');
      expect(typeof results[0].hash).toBe('string');
    });

    test('should handle SVG optimization errors gracefully', async () => {
      const svgBatch = [
        {
          html: '<invalid-svg>not valid</invalid-svg>',
          attributes: { class: null, id: null, width: null, height: null, viewBox: null }
        }
      ];

      // Mock console.warn to avoid test output pollution
      const originalWarn = console.warn;
      console.warn = jest.fn();

      const results = await processSvgBatch(svgBatch, 0);

      expect(results).toHaveLength(1);
      expect(results[0].originalSize).toBe(results[0].optimizedSize); // No optimization when it fails

      console.warn = originalWarn;
    });
  });

  describe('analyzeSvgs', () => {
    test('should analyze SVGs and detect duplicates', async () => {
      const svgs = [
        {
          html: '<svg><circle cx="10" cy="10" r="5"/></svg>',
          attributes: { class: 'icon-1', id: null, width: null, height: null, viewBox: null }
        },
        {
          html: '<svg><circle cx="10" cy="10" r="5"/></svg>', // Duplicate
          attributes: { class: 'icon-2', id: null, width: null, height: null, viewBox: null }
        },
        {
          html: '<svg><rect x="0" y="0" width="10" height="10"/></svg>',
          attributes: { class: 'different', id: null, width: null, height: null, viewBox: null }
        }
      ];

      const result = await analyzeSvgs(svgs);

      expect(result).toHaveProperty('totalOriginalSize');
      expect(result).toHaveProperty('totalOptimizedSize');
      expect(result).toHaveProperty('svgStats');
      expect(result).toHaveProperty('duplicates');
      
      expect(result.svgStats).toHaveLength(3);
      expect(typeof result.totalOriginalSize).toBe('number');
      expect(typeof result.totalOptimizedSize).toBe('number');
      
      // Check for duplicate detection
      const duplicateHashes = Object.keys(result.duplicates);
      expect(duplicateHashes.length).toBeGreaterThan(0);
    });

    test('should handle empty SVG array', async () => {
      const result = await analyzeSvgs([]);

      expect(result.totalOriginalSize).toBe(0);
      expect(result.totalOptimizedSize).toBe(0);
      expect(result.svgStats).toHaveLength(0);
      expect(Object.keys(result.duplicates)).toHaveLength(0);
    });

    test('should process large batches correctly', async () => {
      // Create 25 SVGs to test batch processing (batch size is 10)
      const svgs = Array.from({ length: 25 }, (_, i) => ({
        html: `<svg><circle cx="${i}" cy="${i}" r="5"/></svg>`,
        attributes: { class: `icon-${i}`, id: null, width: null, height: null, viewBox: null }
      }));

      const result = await analyzeSvgs(svgs);

      expect(result.svgStats).toHaveLength(25);
      expect(result.totalOriginalSize).toBeGreaterThan(0);
      expect(result.totalOptimizedSize).toBeGreaterThan(0);
    });
  });

  describe('Integration tests with test files', () => {
    test('should process test HTML file', async () => {
      const testFile = path.join(__dirname, 'test-svgs.html');
      
      // Check if test file exists, if not skip this test
      if (!fs.existsSync(testFile)) {
        console.log('Test HTML file not found, skipping integration test');
        return;
      }

      const html = fs.readFileSync(testFile, 'utf8');
      const svgs = extractInlineSvgs(html);
      
      expect(Array.isArray(svgs)).toBe(true);
      
      if (svgs.length > 0) {
        const result = await analyzeSvgs(svgs);
        expect(result.totalOriginalSize).toBeGreaterThan(0);
        expect(result.svgStats).toHaveLength(svgs.length);
      }
    });
  });
});
