# SVG Opti Detector 🔍

A powerful command-line tool that analyzes HTML files for SVG optimization opportunities and detects duplicate SVGs to help reduce file sizes and improve performance.

## Features

- ✅ Analyze inline SVGs in HTML files or web pages
- 🔍 Detect duplicate SVGs (ignores class differences)
- 📊 Calculate optimization potential using SVGO
- 📈 Deduplication scenario analysis
- 🎯 Sort by optimization potential
- ⚡ Performance-optimized batch processing
- 🎨 Color-coded output with optimization recommendations
- 📱 Support for URLs and local files

## Installation

### Global Installation (Recommended)

```bash
pnpm install -g svg-opti-detector
```

### Local Installation

```bash
pnpm install svg-opti-detector
```

### From Source

```bash
git clone https://github.com/bobharing/svg-opti-detector.git
cd svg-opti-detector
pnpm install
```

## Usage

### Basic Syntax

```bash
svg-opti-detector <url-or-file-path> [options]
```

### Command Line Options

| Option | Short | Description |
|--------|-------|-------------|
| `--duplicates` | `-d` | Show duplicate SVG analysis with deduplication scenarios |
| `--sort-by-savings` | `-s` | Sort SVGs by optimization potential (highest savings first) |

### Examples

#### Analyze a Local HTML File

```bash
# Basic analysis
svg-opti-detector ./index.html

# With duplicate detection
svg-opti-detector ./index.html --duplicates

# Sort by optimization potential
svg-opti-detector ./index.html --sort-by-savings

# Combine options
svg-opti-detector ./index.html -d -s
```

#### Analyze a Website URL

```bash
# Basic analysis
svg-opti-detector https://example.com

# With duplicate detection
svg-opti-detector https://example.com --duplicates
```

#### Using NPM Scripts (Development)

```bash
# Run basic demo
npm run demo

# Run demo with duplicate detection
npm run demo:duplicates

# Run unit tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

## Output Explanation

### Individual SVG Analysis

The tool provides color-coded status indicators for each SVG:

- 🔴 **Red**: High optimization potential (≥20% savings)
- 🟡 **Yellow**: Moderate optimization potential (10-19% savings)  
- ✅ **Green**: Well optimized (<10% savings needed)

Example output:
```
🔴 SVG #0 (class="icon", width="24", height="24")
   Original: 284 bytes | Optimized: 217 bytes
   Savings: 67 bytes (23.6%)
```

### Duplicate Detection

When using the `--duplicates` flag, the tool will:

1. **Identify duplicate SVGs** by content (ignoring class differences)
2. **Group duplicates** and show their locations
3. **Calculate potential savings** from deduplication
4. **Show optimization scenarios**:
   - Scenario 1: Deduplication only
   - Scenario 2: Deduplication + optimization

Example duplicate analysis:
```
⚠️  DUPLICATE SVGs DETECTED
──────────────────────────────────────────────────
● Group 1: "icon star-icon", "icon star-filled", no class
   Found at indices: [0, 2, 5]
   Occurrences: 3 (2 duplicates)
   Potential savings: 413 bytes

🎯 MAXIMUM SAVINGS POTENTIAL:
Combined savings (optimization + deduplication): 772 bytes (29.0%)
Final optimized & deduplicated size: 1.84 KB (1888 bytes)
```

## API Usage (Programmatic)

You can also use SVG Opti Detector programmatically in your Node.js applications:

```javascript
const {
  extractInlineSvgs,
  analyzeSvgs,
  formatBytes
} = require('svg-opti-detector');

async function analyzePage(html) {
  // Extract SVGs from HTML
  const svgs = extractInlineSvgs(html);
  
  // Analyze optimization potential
  const results = await analyzeSvgs(svgs);
  
  console.log(`Found ${svgs.length} SVGs`);
  console.log(`Total savings: ${formatBytes(results.totalOriginalSize - results.totalOptimizedSize)}`);
  
  return results;
}
```

### Available Functions

- `extractInlineSvgs(html)` - Extract SVG elements from HTML
- `analyzeSvgs(svgs)` - Analyze SVGs for optimization and duplicates
- `hashSvg(svgString)` - Generate hash for duplicate detection
- `formatBytes(bytes)` - Format byte sizes with appropriate units
- `generateIdentifierString(attributes)` - Generate attribute display string

## File Size Optimization

The tool uses [SVGO](https://github.com/svg/svgo) with optimized settings to:

- Remove unnecessary metadata and comments
- Optimize path data and transforms
- Remove unused definitions
- Clean up attributes and whitespace
- Remove editor-specific data

### Optimization Plugins Used

- `preset-default` - Standard SVGO optimizations
- `removeDimensions` - Remove width/height when viewBox exists
- `removeComments` - Remove XML comments
- `removeMetadata` - Remove metadata elements
- `removeEditorsNSData` - Remove editor namespace data

## Requirements

- **Node.js**: >=16.0.0
- **Dependencies**: cheerio, svgo, chalk (automatically installed)

## Development

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode for development
npm run test:watch
```

### Test Coverage

The project includes comprehensive unit tests covering:

- HTML parsing and SVG extraction
- SVG optimization and analysis
- Duplicate detection algorithms
- File size calculations and formatting
- Error handling and edge cases
- Integration tests with real HTML files

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes and add tests
4. Run tests (`npm test`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## License

MIT License - see the [LICENSE](LICENSE) file for details.

## Author

**Bob Haring** - [bob.haring@hotmail.com](mailto:bob.haring@hotmail.com)

## Support

- 🐛 [Report Issues](https://github.com/bobharing/svg-opti-detector/issues)
- 📖 [Documentation](https://github.com/bobharing/svg-opti-detector#readme)
- 💬 [Discussions](https://github.com/bobharing/svg-opti-detector/discussions)

---

**Made with ❤️ for web performance optimization**
