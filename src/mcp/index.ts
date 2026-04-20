import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { handleScan, handleGetOptimized } from './handlers.js';

// ---------------------------------------------------------------------------
// Server factory — creates and registers all tools
// ---------------------------------------------------------------------------
function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'svg-opti-detector',
    version: '1.0.0'
  });

  server.tool(
    'svg_scan',
    'Scan a URL or local HTML file for unoptimized and duplicate inline SVGs. ' +
      'Returns a compact summary with indices, identifiers, sizes, and savings potential — no SVG markup. ' +
      'Use svg_get_optimized to retrieve the actual optimized SVG content for specific indices. ' +
      'Accepts a URL (https://...), absolute file path (/path/to/file.html), ' +
      'or raw HTML string via the html parameter. ' +
      'Note: duplicate detection ignores class attributes — SVGs identical except for class names are treated as duplicates.',
    {
      url: z
        .string()
        .optional()
        .describe('URL or absolute file path to scan (provide url or html, not both)'),
      html: z
        .string()
        .optional()
        .describe('Raw HTML string to scan directly (max 5 MB; provide url or html, not both)'),
      threshold: z
        .number()
        .optional()
        .describe('Minimum savings percentage to flag an SVG as unoptimized (default: 5)')
    },
    async ({ url, html, threshold }) => handleScan({ url, html, threshold })
  );

  server.tool(
    'svg_get_optimized',
    'Get optimized SVG content for specific SVGs. ' +
      'Pass indices from a previous svg_scan result to retrieve those SVGs, ' +
      'or provide raw SVG markup directly via the svg parameter. ' +
      'Returns original and optimized SVG pairs with size savings. ' +
      'Use svg_scan first to identify which SVGs need optimization and their indices.',
    {
      url: z
        .string()
        .optional()
        .describe('URL or absolute file path (same source used in svg_scan)'),
      html: z
        .string()
        .optional()
        .describe('Raw HTML string (same source used in svg_scan; max 5 MB)'),
      svg: z.string().optional().describe('Single raw SVG string to optimize directly (max 1 MB)'),
      indices: z
        .array(z.number())
        .optional()
        .describe(
          'Specific SVG indices to retrieve (from svg_scan results). Omit to return all SVGs.'
        )
    },
    async ({ url, html, svg, indices }) => handleGetOptimized({ url, html, svg, indices })
  );

  return server;
}

// ---------------------------------------------------------------------------
// Transport selection and startup
// ---------------------------------------------------------------------------
const transportType = process.env.MCP_TRANSPORT ?? 'stdio';

if (transportType === 'http') {
  // HTTP transport — serves multiple clients via Bun's built-in HTTP server.
  // Each request gets a fresh stateless transport + server instance (no session state needed
  // since all tools are pure functions with no shared state between calls).
  const port = Number(process.env.MCP_PORT ?? '3100');

  Bun.serve({
    port,
    async fetch(req: Request): Promise<Response> {
      const url = new URL(req.url);

      if (url.pathname === '/mcp') {
        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: undefined // stateless mode
        });
        const server = createMcpServer();
        await server.connect(transport);
        return await transport.handleRequest(req);
      }

      if (url.pathname === '/health') {
        return new Response(JSON.stringify({ status: 'ok', server: 'svg-opti-detector' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response('Not Found', { status: 404 });
    }
  });

  process.stderr.write(`svg-opti-detector MCP server listening on http://localhost:${port}/mcp\n`);
} else {
  // stdio transport (default) — used by VS Code, Claude Desktop, and local MCP clients.
  const transport = new StdioServerTransport();
  const server = createMcpServer();
  await server.connect(transport);
}
