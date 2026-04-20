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
- 🤖 MCP server with 3-step tool workflow for AI agent integration

## Installation

### Global Installation (Recommended)

```bash
bun install -g svg-opti-detector
```

### Local Installation

```bash
bun install svg-opti-detector
```

### From Source

```bash
git clone https://github.com/bobharing/svg-opti-detector.git
cd svg-opti-detector
bun install
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

#### Using Bun Scripts (Development)

```bash
# Run basic demo
bun run demo

# Run demo with duplicate detection
bun run demo:duplicates

# Run unit tests
bun test

# Run tests with coverage
bun test --coverage

# Run tests in watch mode
bun test --watch
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

You can also use SVG Opti Detector programmatically in your Bun or Node.js applications:

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

## MCP Server (AI Agent Integration)

SVG Opti Detector includes a [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that exposes its analysis capabilities as tools for AI agents. The server supports both **stdio** and **HTTP** transports.

### Running the MCP Server

```bash
# stdio transport (default) — used by VS Code, Claude Desktop, and local MCP clients
bun run mcp

# HTTP transport — serves multiple clients over HTTP
bun run mcp:http

# HTTP transport with custom port (default: 3100)
MCP_PORT=8080 bun run mcp:http
```

### Building MCP Executables

```bash
# Build for current platform
bun run build:mcp

# Build for all platforms
bun run build:mcp:all
```

### MCP Client Configuration

#### VS Code (stdio)

Add to your VS Code `settings.json` or `.vscode/mcp.json`:

```json
{
  "mcp": {
    "servers": {
      "svg-opti-detector": {
        "command": "bun",
        "args": ["run", "mcp"],
        "cwd": "/path/to/svg-opti-detector"
      }
    }
  }
}
```

#### Claude Desktop (stdio)

Add to your Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "svg-opti-detector": {
      "command": "bun",
      "args": ["run", "--cwd", "/path/to/svg-opti-detector", "mcp"]
    }
  }
}
```

#### HTTP Transport

For any MCP client that supports HTTP/Streamable HTTP:

```json
{
  "mcpServers": {
    "svg-opti-detector": {
      "url": "http://localhost:3100/mcp"
    }
  }
}
```

Start the server first with `bun run mcp:http`, then configure the client to connect. A `/health` endpoint is also available at `http://localhost:3100/health`.

### MCP Tools

The server exposes three tools designed for a step-by-step workflow:

#### Step 1 — `svg_scan` (Discovery)

Scan a URL or HTML and return a **bounded summary**: total SVG count, number of unoptimized SVGs, duplicate group count, top 5 worst offenders, and top 5 duplicate groups. Output size is constant regardless of page complexity — always call this first.

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | string | URL or absolute file path to scan |
| `html` | string | Raw HTML string (max 5 MB) |
| `threshold` | number | Minimum savings % to flag as unoptimized (default: 5) |

#### Step 2 — `svg_list` (Enumeration)

Returns a **paginated, filterable** list of unoptimized SVGs or duplicate groups. Use after `svg_scan` to drill into specific categories.

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | string | Same source used in `svg_scan` |
| `html` | string | Same source used in `svg_scan` |
| `threshold` | number | Minimum savings % (default: 5) |
| `type` | `"unoptimized"` \| `"duplicates"` \| `"all"` | Category to list (default: `"all"`) |
| `minSavingsPercent` | number | Only include SVGs saving ≥ this % |
| `minOriginalSize` | number | Only include SVGs ≥ this size in bytes |
| `limit` | number | Items per page (default: 20, max: 100) |
| `offset` | number | Items to skip for pagination (default: 0) |

#### Step 3 — `svg_get_optimized` (Retrieval)

Get the actual **optimized SVG markup** for specific indices from `svg_list`, or optimize a raw SVG string directly.

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | string | Same source used in `svg_scan` / `svg_list` |
| `html` | string | Same source used in `svg_scan` / `svg_list` |
| `svg` | string | Single raw SVG string to optimize directly (max 1 MB) |
| `indices` | number[] | SVG indices to retrieve (always provide this to avoid large output) |

### Example Agent Workflow

```
1. svg_scan(url: "https://example.com")
   → "42 SVGs found, 18 unoptimized, 6 duplicate groups, top offender saves 45%"

2. svg_list(url: "https://example.com", type: "unoptimized", minSavingsPercent: 20, limit: 10)
   → paginated list of high-impact SVGs with indices

3. svg_get_optimized(url: "https://example.com", indices: [2, 7, 23])
   → original + optimized SVG markup for those specific indices
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

- **Bun**: >=1.0.0
- **Dependencies**: cheerio, svgo, chalk (automatically installed)

## Development

### Running Tests

```bash
# Run all tests
bun test

# Run with coverage
bun test --coverage

# Watch mode for development
bun test --watch
```

### Test Coverage

The project includes comprehensive unit tests covering:

- HTML parsing and SVG extraction
- SVG optimization and analysis
- Duplicate detection algorithms
- File size calculations and formatting
- Error handling and edge cases
- Integration tests with real HTML files

### Building Executables

You can build standalone executables that bundle the Bun runtime and all dependencies into a single binary file.

#### Build for Current Platform

```bash
# Build an optimized executable for your current platform
bun run build
```

This creates an executable named `svg-opti-detector` (or `svg-opti-detector.exe` on Windows) in the project root.

#### Build for Specific Platforms

```bash
# Windows (x64)
bun run build:win

# Linux (x64)
bun run build:linux

# macOS (Apple Silicon)
bun run build:macos

# macOS (Intel)
bun run build:macos-intel

# Build for all platforms
bun run build:all
```

All platform-specific builds are output to the `dist/` directory:
- `dist/svg-opti-detector-win.exe` - Windows executable
- `dist/svg-opti-detector-linux` - Linux executable
- `dist/svg-opti-detector-macos` - macOS (ARM) executable
- `dist/svg-opti-detector-macos-intel` - macOS (Intel) executable

#### Using the Executable

Once built, you can run the executable directly without needing Bun installed:

```bash
# On Windows
.\svg-opti-detector.exe https://example.com --duplicates

# On Linux/macOS
chmod +x svg-opti-detector
./svg-opti-detector https://example.com --duplicates
```

#### Build Optimizations

The build process includes several optimizations:
- **Minification**: Reduces code size
- **Sourcemap**: Enables proper stack traces
- **Bytecode compilation**: Improves startup time by 2x
- **Bundling**: All dependencies are embedded

The executables are typically 60-80MB in size due to the bundled Bun runtime, but they:
- Run without any external dependencies
- Work on systems without Bun installed
- Have faster startup times than regular scripts
- Are fully portable

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes and add tests
4. Run tests (`bun test`)
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
