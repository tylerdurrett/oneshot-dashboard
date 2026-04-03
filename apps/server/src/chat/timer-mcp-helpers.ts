/**
 * Shared helpers for the MCP timer server. Extracted so tests can import
 * these without triggering the stdio transport connection in the entry point.
 */

import http from 'node:http';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export const API_BASE = process.env.ONESHOT_API_BASE ?? 'http://host.docker.internal:4902';

// The Docker sandbox routes HTTP through a MITM proxy. Node 20's built-in
// fetch (undici) ignores HTTP_PROXY, so requests to host.docker.internal fail.
// We use node:http with explicit proxy routing instead.
const HTTP_PROXY = process.env.HTTP_PROXY || process.env.http_proxy;
const PARSED_PROXY = HTTP_PROXY ? new URL(HTTP_PROXY) : null;

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

export interface ApiResult {
  ok: boolean;
  status: number;
  data: unknown;
}

export async function api(method: string, path: string, body?: unknown): Promise<ApiResult> {
  const url = `${API_BASE}${path}`;
  const payload = body !== undefined ? JSON.stringify(body) : undefined;

  return new Promise((resolve, reject) => {
    const target = new URL(url);
    // When a proxy is configured, route through it: connect to the proxy host
    // and set the full URL as the request path (HTTP forward-proxy convention).
    const options: http.RequestOptions = {
      hostname: PARSED_PROXY ? PARSED_PROXY.hostname : target.hostname,
      port: PARSED_PROXY ? Number(PARSED_PROXY.port) : Number(target.port) || 80,
      path: PARSED_PROXY ? url : target.pathname + target.search,
      method,
      timeout: 15_000,
      headers: {
        Host: target.host,
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => {
        let parsed: unknown;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        const status = res.statusCode ?? 500;
        resolve({ ok: status >= 200 && status < 300, status, data: parsed });
      });
    });
    req.on('timeout', () => { req.destroy(new Error('Request timed out')); });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Bucket name resolution
// ---------------------------------------------------------------------------

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Bucket {
  id: string;
  name: string;
}

export async function resolveBucket(nameOrId: string): Promise<{ id: string } | { error: string }> {
  if (UUID_RE.test(nameOrId)) return { id: nameOrId };

  const res = await api('GET', '/timers/buckets');
  if (!res.ok) return { error: `Failed to fetch buckets: ${JSON.stringify(res.data)}` };

  const buckets = (res.data as { buckets: Bucket[] }).buckets ?? [];
  const needle = nameOrId.toLowerCase();

  // Exact case-insensitive match first
  const exact = buckets.filter((b) => b.name.toLowerCase() === needle);
  if (exact.length === 1) return { id: exact[0]!.id };

  // Substring match
  const partial = buckets.filter((b) => b.name.toLowerCase().includes(needle));
  if (partial.length === 1) return { id: partial[0]!.id };

  const names = buckets.map((b) => b.name).join(', ');
  if (partial.length > 1) {
    return { error: `Multiple buckets match "${nameOrId}": ${partial.map((b) => b.name).join(', ')}. Be more specific. Available: ${names}` };
  }
  return { error: `No bucket matches "${nameOrId}". Available buckets: ${names}` };
}

/** Resolve or return an MCP error result. */
export async function resolveOrError(nameOrId: string): Promise<
  { id: string; error?: undefined } | { id?: undefined; error: { content: Array<{ type: 'text'; text: string }>; isError: true } }
> {
  const result = await resolveBucket(nameOrId);
  if ('error' in result) {
    return { error: { content: [{ type: 'text' as const, text: result.error }], isError: true } };
  }
  return result;
}

// ---------------------------------------------------------------------------
// Result formatters
// ---------------------------------------------------------------------------

export function textResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

export function errorResult(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true as const };
}

export function apiError(res: ApiResult) {
  return errorResult(`API error (${res.status}): ${JSON.stringify(res.data)}`);
}
