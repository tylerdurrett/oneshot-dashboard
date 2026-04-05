/**
 * Integration tests for the MCP Streamable HTTP endpoint (/mcp).
 *
 * Uses a real listening server because the MCP transport uses reply.hijack()
 * to write directly to the raw HTTP response, bypassing Fastify's inject().
 */

import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { buildServer } from '../index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract JSON-RPC messages from an SSE response body. */
function parseSseMessages(body: string): unknown[] {
  return body
    .split('\n\n')
    .filter(Boolean)
    .map((event) => {
      const dataLine = event
        .split('\n')
        .find((line) => line.startsWith('data: '));
      if (!dataLine) return null;
      try {
        return JSON.parse(dataLine.slice(6));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/** POST a JSON-RPC request to /mcp and return the parsed result. */
function postMcp(
  port: number,
  body: unknown,
  headers?: Record<string, string>,
): Promise<{
  status: number;
  contentType: string;
  body: string;
  sessionId?: string;
}> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/mcp',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => (data += chunk.toString()));
        res.on('end', () =>
          resolve({
            status: res.statusCode!,
            contentType: res.headers['content-type'] ?? '',
            body: data,
            sessionId: res.headers['mcp-session-id'] as string | undefined,
          }),
        );
      },
    );
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

/** Parse the JSON-RPC result from an MCP response (handles both JSON and SSE). */
function extractJsonRpcResult(response: {
  contentType: string;
  body: string;
}): Record<string, unknown> {
  if (response.contentType.includes('text/event-stream')) {
    const messages = parseSseMessages(response.body);
    return (messages[0] as { result: Record<string, unknown> }).result;
  }
  return (JSON.parse(response.body) as { result: Record<string, unknown> })
    .result;
}

const MCP_INIT_REQUEST = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    capabilities: {},
    protocolVersion: '2025-03-26',
    clientInfo: { name: 'test', version: '1.0.0' },
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MCP Streamable HTTP endpoint', () => {
  let server: ReturnType<typeof buildServer>;
  let port: number;

  afterEach(async () => {
    await server?.close();
  });

  it('responds to initialize with server info and tool capabilities', async () => {
    server = buildServer({ logger: false });
    const address = await server.listen({ port: 0, host: '127.0.0.1' });
    port = Number(new URL(address).port);

    const response = await postMcp(port, MCP_INIT_REQUEST);

    expect(response.status).toBe(200);
    expect(response.sessionId).toBeDefined();

    const result = extractJsonRpcResult(response);
    expect((result.serverInfo as Record<string, unknown>).name).toBe(
      'oneshot',
    );
    expect(result.capabilities).toHaveProperty('tools');
  });

  it('returns all registered tools via tools/list', async () => {
    server = buildServer({ logger: false });
    const address = await server.listen({ port: 0, host: '127.0.0.1' });
    port = Number(new URL(address).port);

    // Step 1: Initialize the MCP session
    const initResponse = await postMcp(port, MCP_INIT_REQUEST);
    expect(initResponse.status).toBe(200);
    const sessionId = initResponse.sessionId;
    expect(sessionId).toBeDefined();

    // Step 2: Send initialized notification (required by MCP protocol)
    await postMcp(
      port,
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { 'mcp-session-id': sessionId! },
    );

    // Step 3: Request the tool list
    const listResponse = await postMcp(
      port,
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      { 'mcp-session-id': sessionId! },
    );
    expect(listResponse.status).toBe(200);

    const result = extractJsonRpcResult(listResponse);
    const tools = result.tools as Array<{ name: string }>;

    const expectedTools = [
      'get_timer_status',
      'list_buckets',
      'start_timer',
      'stop_timer',
      'reset_timer',
      'create_bucket',
      'update_bucket',
      'delete_bucket',
      'set_timer_time',
      'set_daily_goal',
      'dismiss_bucket',
      'get_current_doc',
      'list_docs',
      'read_doc',
    ];

    const toolNames = tools.map((t) => t.name).sort();
    expect(toolNames).toEqual(expectedTools.sort());
  });

  it('supports multiple sequential client sessions', async () => {
    server = buildServer({ logger: false });
    const address = await server.listen({ port: 0, host: '127.0.0.1' });
    port = Number(new URL(address).port);

    // Client 1 initializes
    const client1 = await postMcp(port, MCP_INIT_REQUEST);
    expect(client1.status).toBe(200);
    expect(client1.sessionId).toBeDefined();

    // Client 2 initializes — must get a different session
    const client2 = await postMcp(port, MCP_INIT_REQUEST);
    expect(client2.status).toBe(200);
    expect(client2.sessionId).toBeDefined();
    expect(client2.sessionId).not.toBe(client1.sessionId);

    // Both sessions can list tools independently
    for (const sessionId of [client1.sessionId!, client2.sessionId!]) {
      await postMcp(
        port,
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { 'mcp-session-id': sessionId },
      );

      const listResponse = await postMcp(
        port,
        { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
        { 'mcp-session-id': sessionId },
      );
      expect(listResponse.status).toBe(200);

      const result = extractJsonRpcResult(listResponse);
      const tools = result.tools as Array<{ name: string }>;
      expect(tools.length).toBe(14);
    }
  });

  it('returns 400 for unknown session ID', async () => {
    server = buildServer({ logger: false });
    const address = await server.listen({ port: 0, host: '127.0.0.1' });
    port = Number(new URL(address).port);

    const response = await postMcp(
      port,
      { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
      { 'mcp-session-id': 'nonexistent-session-id' },
    );

    expect(response.status).toBe(400);
  });

  it('GET /health still works after MCP registration', async () => {
    server = buildServer({ logger: false });
    const response = await server.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('ok');
  });
});
