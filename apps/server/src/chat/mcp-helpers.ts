/**
 * Shared helpers for the MCP server — resolution helpers and result formatters.
 *
 * All HTTP proxy logic was removed in Phase 3.4. Tool handlers now call
 * service functions directly via the database instance.
 */

import { listBuckets } from '../services/timer-bucket.js';
import { listDocuments } from '../services/document.js';
import { getDefaultWorkspaceId } from '../services/workspace.js';
import type { Database } from '../services/thread.js';

// ---------------------------------------------------------------------------
// Bucket name resolution
// ---------------------------------------------------------------------------

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Bucket {
  id: string;
  name: string;
}

export async function resolveBucket(nameOrId: string, db: Database): Promise<{ id: string } | { error: string }> {
  if (UUID_RE.test(nameOrId)) return { id: nameOrId };

  let buckets: Bucket[];
  try {
    buckets = await listBuckets(db);
  } catch (e) {
    return { error: `Failed to fetch buckets: ${(e as Error).message}` };
  }
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
export async function resolveOrError(nameOrId: string, db: Database): Promise<
  { id: string; error?: undefined } | { id?: undefined; error: { content: Array<{ type: 'text'; text: string }>; isError: true } }
> {
  const result = await resolveBucket(nameOrId, db);
  if ('error' in result) {
    return { error: { content: [{ type: 'text' as const, text: result.error }], isError: true } };
  }
  return result;
}

// ---------------------------------------------------------------------------
// Doc name resolution
// ---------------------------------------------------------------------------

interface Doc {
  id: string;
  title: string;
}

export async function resolveDoc(nameOrId: string, db: Database): Promise<{ id: string } | { error: string }> {
  if (UUID_RE.test(nameOrId)) return { id: nameOrId };

  let docs: Doc[];
  try {
    const wsId = await getDefaultWorkspaceId(db);
    if (!wsId) return { error: 'No default workspace found' };
    const rows = await listDocuments(wsId, db);
    docs = rows.map((r) => ({ id: r.id, title: r.title }));
  } catch (e) {
    return { error: `Failed to fetch docs: ${(e as Error).message}` };
  }
  const needle = nameOrId.toLowerCase();

  // Exact case-insensitive match first
  const exact = docs.filter((d) => d.title.toLowerCase() === needle);
  if (exact.length === 1) return { id: exact[0]!.id };

  // Substring match
  const partial = docs.filter((d) => d.title.toLowerCase().includes(needle));
  if (partial.length === 1) return { id: partial[0]!.id };

  const titles = docs.map((d) => d.title).join(', ');
  if (partial.length > 1) {
    return { error: `Multiple docs match "${nameOrId}": ${partial.map((d) => d.title).join(', ')}. Be more specific. Available: ${titles}` };
  }
  return { error: `No doc matches "${nameOrId}". Available docs: ${titles}` };
}

/** Resolve a doc name/ID or return an MCP error result. */
export async function resolveDocOrError(nameOrId: string, db: Database): Promise<
  { id: string; error?: undefined } | { id?: undefined; error: { content: Array<{ type: 'text'; text: string }>; isError: true } }
> {
  const result = await resolveDoc(nameOrId, db);
  if ('error' in result) {
    return { error: { content: [{ type: 'text' as const, text: result.error }], isError: true } };
  }
  return result;
}

// ---------------------------------------------------------------------------
// Plain text extraction (lightweight — no DOM needed)
// ---------------------------------------------------------------------------

/**
 * Extract plain text from BlockNote JSONB content blocks.
 * Walks the block tree, concatenating text spans from `content[].text`.
 * Used by list_docs to generate content snippets without pulling in
 * linkedom/BlockNote (which live on the server side only).
 */
export function extractPlainText(blocks: unknown[]): string {
  const lines: string[] = [];

  for (const block of blocks) {
    if (typeof block !== 'object' || block === null) continue;
    const b = block as Record<string, unknown>;

    if (Array.isArray(b.content)) {
      const spans: string[] = [];
      for (const inline of b.content) {
        if (
          typeof inline === 'object' &&
          inline !== null &&
          (inline as Record<string, unknown>).type === 'text' &&
          typeof (inline as Record<string, unknown>).text === 'string'
        ) {
          spans.push((inline as Record<string, unknown>).text as string);
        }
      }
      if (spans.length) lines.push(spans.join(''));
    }

    if (Array.isArray(b.children)) {
      const childText = extractPlainText(b.children as unknown[]);
      if (childText) lines.push(childText);
    }
  }

  return lines.join('\n');
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
