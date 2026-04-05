/**
 * MCP over Streamable HTTP — Fastify route plugin.
 *
 * Serves the MCP protocol at `/mcp` using the SDK's StreamableHTTPServerTransport.
 * Each client session gets its own transport + McpServer instance, following the
 * SDK's recommended per-session pattern. A sessions map tracks active transports
 * so subsequent requests route to the correct session.
 */

import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

export interface McpRoutesOptions {
  /** Factory that creates a fresh McpServer with all tools registered. */
  createMcpServer: () => McpServer;
}

/** Fastify plugin that serves MCP tools over Streamable HTTP at /mcp. */
export async function mcpRoutes(
  server: FastifyInstance,
  opts: McpRoutesOptions,
) {
  const { createMcpServer } = opts;

  // Per-session transport map. Each client (claude -p invocation) gets its own
  // transport + McpServer so sessions don't interfere with each other.
  const sessions = new Map<string, { transport: StreamableHTTPServerTransport; lastActivity: number }>();

  // Reap idle sessions every 5 minutes. Clients (claude -p) are ephemeral and
  // may exit without sending DELETE, so onclose never fires for those sessions.
  const SESSION_TTL_MS = 5 * 60 * 1000;
  const reaper = setInterval(() => {
    const cutoff = Date.now() - SESSION_TTL_MS;
    for (const [id, entry] of sessions) {
      if (entry.lastActivity < cutoff) {
        entry.transport.close().catch(() => {});
        sessions.delete(id);
      }
    }
  }, SESSION_TTL_MS);

  server.route({
    method: ['GET', 'POST', 'DELETE'],
    url: '/mcp',
    async handler(request, reply) {
      const sessionId = request.headers['mcp-session-id'] as string | undefined;

      // Existing session — route to its transport
      if (sessionId && sessions.has(sessionId)) {
        const entry = sessions.get(sessionId)!;
        entry.lastActivity = Date.now();
        reply.hijack();
        await entry.transport.handleRequest(request.raw, reply.raw, request.body as unknown);
        return;
      }

      // New initialize request — create a fresh transport + server
      if (!sessionId && request.method === 'POST' && isInitializeRequest(request.body)) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
          onsessioninitialized: (id) => {
            sessions.set(id, { transport, lastActivity: Date.now() });
          },
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid) sessions.delete(sid);
        };

        const mcpServer = createMcpServer();
        await mcpServer.connect(transport);

        reply.hijack();
        await transport.handleRequest(request.raw, reply.raw, request.body as unknown);
        return;
      }

      // Anything else is invalid — missing/unknown session or non-initialize without session
      reply.status(400).send({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: No valid session ID provided',
        },
        id: null,
      });
    },
  });

  server.addHook('onClose', async () => {
    clearInterval(reaper);
    for (const { transport } of sessions.values()) {
      await transport.close();
    }
    sessions.clear();
  });
}
