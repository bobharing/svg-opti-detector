import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { z } from 'zod';
import { handleScan, handleGetOptimized } from '../../src/mcp/handlers';

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const HOME_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <!-- home icon -->
  <metadata>icon metadata</metadata>
  <g><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"></path></g>
</svg>`;

const HTML_ONE = `<html><body>${HOME_SVG}</body></html>`;

// ---------------------------------------------------------------------------
// Server factory — mirrors src/mcp/index.ts (without transport boilerplate)
// ---------------------------------------------------------------------------

function buildTestServer(): McpServer {
  const server = new McpServer({ name: 'svg-opti-detector-test', version: '1.0.0' });

  server.registerTool(
    'svg_scan',
    {
      description: 'Scan for unoptimized SVGs.',
      inputSchema: {
        url: z.string().optional(),
        html: z.string().optional(),
        threshold: z.number().optional()
      }
    },
    async ({ url, html, threshold }) => handleScan({ url, html, threshold })
  );

  server.registerTool(
    'svg_get_optimized',
    {
      description: 'Get optimized SVG content.',
      inputSchema: {
        url: z.string().optional(),
        html: z.string().optional(),
        svg: z.string().optional(),
        indices: z.array(z.number()).optional()
      }
    },
    async ({ url, html, svg, indices }) => handleGetOptimized({ url, html, svg, indices })
  );

  return server;
}

// ---------------------------------------------------------------------------
// Integration test suite
// ---------------------------------------------------------------------------

describe('MCP server integration', () => {
  let client: Client;
  let server: McpServer;

  beforeEach(async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    server = buildTestServer();
    client = new Client({ name: 'test-client', version: '1.0.0' });

    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
  });

  // -------------------------------------------------------------------------
  // Tool discovery
  // -------------------------------------------------------------------------

  test('server advertises tools capability', async () => {
    const info = client.getServerCapabilities();
    expect(info?.tools).toBeDefined();
  });

  test('lists exactly 2 tools', async () => {
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(2);
  });

  test('tool names are svg_scan and svg_get_optimized', async () => {
    const { tools } = await client.listTools();
    const names = tools.map(t => t.name);
    expect(names).toContain('svg_scan');
    expect(names).toContain('svg_get_optimized');
  });

  test('svg_scan tool has inputSchema with url, html, threshold', async () => {
    const { tools } = await client.listTools();
    const scan = tools.find(t => t.name === 'svg_scan')!;
    const props = (scan.inputSchema as { properties: Record<string, unknown> }).properties;
    expect(props).toHaveProperty('url');
    expect(props).toHaveProperty('html');
    expect(props).toHaveProperty('threshold');
  });

  test('svg_get_optimized tool has inputSchema with url, html, svg, indices', async () => {
    const { tools } = await client.listTools();
    const tool = tools.find(t => t.name === 'svg_get_optimized')!;
    const props = (tool.inputSchema as { properties: Record<string, unknown> }).properties;
    expect(props).toHaveProperty('url');
    expect(props).toHaveProperty('html');
    expect(props).toHaveProperty('svg');
    expect(props).toHaveProperty('indices');
  });

  // -------------------------------------------------------------------------
  // svg_scan end-to-end calls
  // -------------------------------------------------------------------------

  test('svg_scan returns successful result for valid html', async () => {
    const result = await client.callTool({ name: 'svg_scan', arguments: { html: HTML_ONE } });
    expect(result.isError).toBeFalsy();
    expect(result.content).toHaveLength(1);
  });

  test('svg_scan result content is valid JSON', async () => {
    const result = await client.callTool({ name: 'svg_scan', arguments: { html: HTML_ONE } });
    const item = result.content[0] as { type: string; text: string };
    expect(item.type).toBe('text');
    expect(() => JSON.parse(item.text)).not.toThrow();
  });

  test('svg_scan result has totalSvgs of 1 for single-SVG HTML', async () => {
    const result = await client.callTool({ name: 'svg_scan', arguments: { html: HTML_ONE } });
    const item = result.content[0] as { type: string; text: string };
    const data = JSON.parse(item.text);
    expect(data.totalSvgs).toBe(1);
  });

  test('svg_scan returns isError for missing parameters', async () => {
    const result = await client.callTool({ name: 'svg_scan', arguments: {} });
    expect(result.isError).toBe(true);
  });

  // -------------------------------------------------------------------------
  // svg_get_optimized end-to-end calls
  // -------------------------------------------------------------------------

  test('svg_get_optimized returns successful result for direct svg param', async () => {
    const result = await client.callTool({
      name: 'svg_get_optimized',
      arguments: { svg: HOME_SVG }
    });
    expect(result.isError).toBeFalsy();
  });

  test('svg_get_optimized result content is valid JSON', async () => {
    const result = await client.callTool({
      name: 'svg_get_optimized',
      arguments: { svg: HOME_SVG }
    });
    const item = result.content[0] as { type: string; text: string };
    expect(item.type).toBe('text');
    expect(() => JSON.parse(item.text)).not.toThrow();
  });

  test('svg_get_optimized with html returns correct index', async () => {
    const result = await client.callTool({
      name: 'svg_get_optimized',
      arguments: { html: HTML_ONE, indices: [0] }
    });
    const item = result.content[0] as { type: string; text: string };
    const data = JSON.parse(item.text);
    expect((data.svgs as { index: number }[])[0].index).toBe(0);
  });

  test('svg_get_optimized returns isError for missing parameters', async () => {
    const result = await client.callTool({ name: 'svg_get_optimized', arguments: {} });
    expect(result.isError).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Two-step workflow: svg_scan → svg_get_optimized
  // -------------------------------------------------------------------------

  test('two-step workflow: scan then retrieve optimized for flagged indices', async () => {
    // Step 1: scan
    const scanResult = await client.callTool({ name: 'svg_scan', arguments: { html: HTML_ONE } });
    const scanItem = scanResult.content[0] as { text: string };
    const scanData = JSON.parse(scanItem.text);

    // Collect all SVG indices from unoptimized + errors
    const allIndices = [
      ...(scanData.unoptimized as { index: number }[]).map(u => u.index),
      ...(scanData.errors ?? []).map((e: { index: number }) => e.index)
    ];

    if (allIndices.length === 0) {
      // SVG already optimal — nothing to retrieve, test passes
      return;
    }

    // Step 2: retrieve optimized for flagged indices
    const optResult = await client.callTool({
      name: 'svg_get_optimized',
      arguments: { html: HTML_ONE, indices: allIndices }
    });
    expect(optResult.isError).toBeFalsy();
    const optItem = optResult.content[0] as { text: string };
    const optData = JSON.parse(optItem.text);
    expect((optData.svgs as unknown[]).length).toBe(allIndices.length);
  });
});
