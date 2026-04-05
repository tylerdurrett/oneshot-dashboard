/**
 * MCP over Streamable HTTP — Fastify route plugin.
 *
 * Serves the MCP protocol at `/mcp` using the SDK's StreamableHTTPServerTransport.
 * The transport handles POST (JSON-RPC requests), GET (SSE stream), and DELETE
 * (session cleanup) internally based on the HTTP method.
 */

import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

export interface McpRoutesOptions {
  mcpServer: McpServer;
}

/** Fastify plugin that serves MCP tools over Streamable HTTP at /mcp. */
export async function mcpRoutes(
  server: FastifyInstance,
  opts: McpRoutesOptions,
) {
  const { mcpServer } = opts;

  // Stateful transport — stateless mode throws on the second request because
  // the SDK enforces one-shot usage for stateless transports.
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  });

  await mcpServer.connect(transport);

  server.route({
    method: ['GET', 'POST', 'DELETE'],
    url: '/mcp',
    async handler(request, reply) {
      reply.hijack();
      await transport.handleRequest(request.raw, reply.raw, request.body as unknown);
    },
  });

  server.addHook('onClose', async () => {
    await transport.close();
  });
}
