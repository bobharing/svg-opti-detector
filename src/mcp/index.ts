import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { handleScan, handleList, handleGetOptimized } from './handlers.js';

// ---------------------------------------------------------------------------
// Server factory — creates and registers all tools
// ---------------------------------------------------------------------------
function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'svg-opti-detector',
    version: '1.0.0'
  });

  server.registerTool(
    'svg_scan',
    {
      description:
        'STEP 1 — Discovery. Scan a URL or HTML file and return a concise, bounded summary: ' +
        'total SVG count, number of unoptimized SVGs above threshold, duplicate group count, ' +
        'top 5 worst offenders by savings %, and top 5 duplicate groups by wasted bytes. ' +
        'Output size is constant regardless of how many SVGs the page contains. ' +
        'Always call this first to understand scope before using svg_list or svg_get_optimized. ' +
        'Duplicate detection ignores class attributes — SVGs identical except for class names are grouped together.',
      inputSchema: {
        url: z
          .string()
          .optional()
          .describe('URL (https://...) or absolute file path to scan. Provide url or html, not both.'),
        html: z
          .string()
          .optional()
          .describe('Raw HTML string to scan directly (max 5 MB). Provide url or html, not both.'),
        threshold: z
          .number()
          .optional()
          .describe('Minimum savings % to count an SVG as unoptimized (default: 5). Use the same value in svg_list for consistent counts.')
      }
    },
    async ({ url, html, threshold }) => handleScan({ url, html, threshold })
  );

  server.registerTool(
    'svg_list',
    {
      description:
        'STEP 2 — Enumeration. Returns a paginated, filterable list of SVGs after svg_scan. ' +
        'Use type="unoptimized" to list individual SVGs sorted by savings % descending ' +
        '(returns index, identifier, originalSize, optimizedSize, savingsPercent per item). ' +
        'Use type="duplicates" to list duplicate groups sorted by wasted bytes descending ' +
        '(returns indices, count, wastedBytes, identifier per group). ' +
        'Use type="all" (default) to get both sections in one call. ' +
        'Apply minSavingsPercent to focus only on high-impact items (e.g. 20 = only SVGs saving ≥20%). ' +
        'Apply minOriginalSize (bytes) to skip small SVGs not worth optimizing. ' +
        'Paginate with limit (max 100, default 20) and offset; check hasMore in the response for more pages. ' +
        'Pass the returned indices to svg_get_optimized to retrieve actual optimized SVG markup.',
      inputSchema: {
        url: z
          .string()
          .optional()
          .describe('URL (https://...) or absolute file path — same source used in svg_scan. Provide url or html, not both.'),
        html: z
          .string()
          .optional()
          .describe('Raw HTML string (max 5 MB) — same source used in svg_scan. Provide url or html, not both.'),
        threshold: z
          .number()
          .optional()
          .describe('Minimum savings % to consider an SVG unoptimized (default: 5). Use the same value as svg_scan for consistent counts.'),
        type: z
          .enum(['unoptimized', 'duplicates', 'all'])
          .optional()
          .describe('Which category to list: "unoptimized" SVGs, "duplicates" groups, or "all" (default). minSavingsPercent applies to unoptimized only.'),
        minSavingsPercent: z
          .number()
          .optional()
          .describe('Only include unoptimized SVGs with savings >= this % (e.g. 20 focuses on high-impact items). Does not apply to duplicates.'),
        minOriginalSize: z
          .number()
          .optional()
          .describe('Only include SVGs/groups with original size >= this value in bytes. Filters out small SVGs unlikely to be worth optimizing.'),
        limit: z
          .number()
          .optional()
          .describe('Number of items per page (default: 20, max: 100).'),
        offset: z
          .number()
          .optional()
          .describe('Items to skip for pagination (default: 0). Increment by limit to fetch the next page.')
      }
    },
    async ({ url, html, threshold, type, minSavingsPercent, minOriginalSize, limit, offset }) =>
      handleList({ url, html, threshold, type, minSavingsPercent, minOriginalSize, limit, offset })
  );

  server.registerTool(
    'svg_get_optimized',
    {
      description:
        'STEP 3 — Retrieval. Get optimized SVG markup for specific indices from a previous svg_list result. ' +
        'Always pass an explicit indices array — omitting it returns all SVGs, which can be very large on pages with many SVGs. ' +
        'Alternatively, pass a raw SVG string via the svg parameter to optimize it directly without scanning. ' +
        'Returns original and optimized SVG markup pairs with per-item size savings.',
      inputSchema: {
        url: z
          .string()
          .optional()
          .describe('URL or absolute file path (same source used in svg_scan / svg_list)'),
        html: z
          .string()
          .optional()
          .describe('Raw HTML string (same source used in svg_scan / svg_list; max 5 MB)'),
        svg: z.string().optional().describe('Single raw SVG string to optimize directly (max 1 MB). Use instead of url/html for one-off optimization.'),
        indices: z
          .array(z.number())
          .optional()
          .describe(
            'Indices of SVGs to retrieve (from svg_list results). Always provide this to avoid fetching all SVGs.'
          )
      }
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
        // Stateless mode: only POST is supported. Reject GET (SSE notification stream)
        // with 405 so clients don't retry indefinitely.
        if (req.method === 'GET') {
          return new Response(
            JSON.stringify({ error: 'Server-sent events not supported in stateless mode' }),
            { status: 405, headers: { 'Content-Type': 'application/json', Allow: 'POST' } }
          );
        }
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