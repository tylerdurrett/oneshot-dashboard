import { generateText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { desc, eq, sql } from 'drizzle-orm';
import { db as defaultDb, documents } from '@repo/db';
import { config } from '../config.js';
import type { Database } from './thread.js';
import { getDefaultWorkspaceId, titleFromDate } from './workspace.js';

type DocumentRow = typeof documents.$inferSelect;

/** Return the single default document, creating it on first access. */
export async function getDefaultDocument(
  database: Database = defaultDb,
): Promise<DocumentRow> {
  const rows = await database.select().from(documents).limit(1);
  if (rows[0]) return rows[0];

  // Auto-create on first access with workspace assignment and dated title
  const now = new Date().toISOString();
  const workspaceId = await getDefaultWorkspaceId(database);
  const emptyContent: unknown[] = [];
  const [inserted] = await database
    .insert(documents)
    .values({
      content: emptyContent,
      title: titleFromDate(now),
      workspaceId: workspaceId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!inserted) throw new Error('Failed to create default document');
  return inserted;
}

/** Update document content and bump updatedAt. */
export async function updateDocumentContent(
  id: string,
  content: unknown[],
  database: Database = defaultDb,
): Promise<DocumentRow | undefined> {
  const now = new Date().toISOString();
  const [updated] = await database
    .update(documents)
    .set({ content, updatedAt: now })
    .where(eq(documents.id, id))
    .returning();
  return updated;
}

/** List all documents for a workspace: pinned first (pinnedAt desc), then unpinned (updatedAt desc). */
export async function listDocuments(
  workspaceId: string,
  database: Database = defaultDb,
): Promise<DocumentRow[]> {
  return database
    .select()
    .from(documents)
    .where(eq(documents.workspaceId, workspaceId))
    .orderBy(
      sql`CASE WHEN ${documents.pinnedAt} IS NOT NULL THEN 0 ELSE 1 END`,
      desc(documents.pinnedAt),
      desc(documents.updatedAt),
    );
}

/** Get a single document by ID, or null if not found. */
export async function getDocumentById(
  id: string,
  database: Database = defaultDb,
): Promise<DocumentRow | null> {
  const [doc] = await database
    .select()
    .from(documents)
    .where(eq(documents.id, id))
    .limit(1);
  return doc ?? null;
}

/** Get the most recently edited document for a workspace, auto-creating one if none exist. */
export async function getMostRecentDocument(
  workspaceId: string,
  database: Database = defaultDb,
): Promise<DocumentRow> {
  const [doc] = await database
    .select()
    .from(documents)
    .where(eq(documents.workspaceId, workspaceId))
    .orderBy(desc(documents.updatedAt))
    .limit(1);
  if (doc) return doc;

  return createDocument(workspaceId, undefined, database);
}

/** Create a new document with optional title (defaults to "Notes [date]"). */
export async function createDocument(
  workspaceId: string,
  title?: string,
  database: Database = defaultDb,
): Promise<DocumentRow> {
  const now = new Date().toISOString();
  const [inserted] = await database
    .insert(documents)
    .values({
      content: [] as unknown[],
      title: title ?? titleFromDate(now),
      workspaceId,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!inserted) throw new Error('Failed to create document');
  return inserted;
}

/** Update a document's title, bump updatedAt, and mark isTitleManual = true.
 *  Use only for user-initiated title edits — auto-generated titles bypass this function. */
export async function updateDocumentTitle(
  id: string,
  title: string,
  database: Database = defaultDb,
): Promise<DocumentRow | undefined> {
  const now = new Date().toISOString();
  const [updated] = await database
    .update(documents)
    .set({ title, isTitleManual: true, updatedAt: now })
    .where(eq(documents.id, id))
    .returning();
  return updated;
}

/** Delete a document by ID. Returns true if deleted, false if not found. */
export async function deleteDocument(
  id: string,
  database: Database = defaultDb,
): Promise<boolean> {
  const result = await database
    .delete(documents)
    .where(eq(documents.id, id))
    .returning({ id: documents.id });
  return result.length > 0;
}

/** Pin a document (sets pinnedAt to now). */
export async function pinDocument(
  id: string,
  database: Database = defaultDb,
): Promise<DocumentRow | undefined> {
  const now = new Date().toISOString();
  const [updated] = await database
    .update(documents)
    .set({ pinnedAt: now, updatedAt: now })
    .where(eq(documents.id, id))
    .returning();
  return updated;
}

/** Unpin a document (sets pinnedAt to null). */
export async function unpinDocument(
  id: string,
  database: Database = defaultDb,
): Promise<DocumentRow | undefined> {
  const now = new Date().toISOString();
  const [updated] = await database
    .update(documents)
    .set({ pinnedAt: null, updatedAt: now })
    .where(eq(documents.id, id))
    .returning();
  return updated;
}

// -- Auto-title utilities --

/** Recursively extract plain text from BlockNote JSONB content blocks. */
export function extractTextFromBlocks(blocks: unknown[]): string {
  const lines: string[] = [];

  for (const block of blocks) {
    if (typeof block !== 'object' || block === null) continue;
    const b = block as Record<string, unknown>;

    // Concatenate inline text spans within a single block
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

    // Recurse into children
    if (Array.isArray(b.children)) {
      const childText = extractTextFromBlocks(b.children as unknown[]);
      if (childText) lines.push(childText);
    }
  }

  return lines.join('\n');
}

/** Count words in a string. Returns 0 for empty/whitespace-only input. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/** Extract IDs from top-level blocks. */
export function extractBlockIds(blocks: unknown[]): string[] {
  return blocks
    .filter(
      (b): b is Record<string, unknown> =>
        typeof b === 'object' && b !== null && typeof (b as Record<string, unknown>).id === 'string',
    )
    .map((b) => b.id as string);
}

let apiKeyWarningLogged = false;

/** Reset the API key warning flag. Exported for test isolation. */
export function resetApiKeyWarning(): void {
  apiKeyWarningLogged = false;
}

/** Max characters of document text sent to the AI model for title generation. */
const TITLE_PROMPT_MAX_CHARS = 2000;

/**
 * Generate a title for a document using Gemini Flash via the Vercel AI SDK.
 * Guards: skips if isTitleManual is true, API key is empty, or content is below threshold.
 * On success: updates title, sets isTitleManual = false, stores titleGeneratedFromBlockIds.
 */
export async function generateDocumentTitle(
  id: string,
  database: Database = defaultDb,
): Promise<DocumentRow | undefined> {
  const doc = await getDocumentById(id, database);
  if (!doc) return undefined;

  // Guard: manual title — never overwrite user edits
  if (doc.isTitleManual) return doc;

  // Guard: no API key configured
  if (!config.googleGeminiApiKey) {
    if (!apiKeyWarningLogged) {
      console.warn('[auto-title] GOOGLE_GEMINI_API_KEY is not set — skipping title generation');
      apiKeyWarningLogged = true;
    }
    return doc;
  }

  if (!Array.isArray(doc.content)) return doc;

  const content = doc.content as unknown[];
  const text = extractTextFromBlocks(content);
  const blockIds = extractBlockIds(content);
  const wordCount = countWords(text);

  // Guard: content below threshold — lower bar for first title (20 words)
  // vs re-title (50 words). Block count threshold is always 3.
  const wordThreshold = doc.titleGeneratedFromBlockIds ? 50 : 20;
  if (wordCount < wordThreshold && blockIds.length < 3) return doc;

  // Truncate to avoid sending huge documents to the AI model
  const promptText = text.length > TITLE_PROMPT_MAX_CHARS
    ? text.slice(0, TITLE_PROMPT_MAX_CHARS) + '...'
    : text;

  try {
    const { text: generatedTitle } = await generateText({
      // Pass API key explicitly — the SDK default env var name
      // (GOOGLE_GENERATIVE_AI_API_KEY) differs from our config convention.
      model: createGoogleGenerativeAI({ apiKey: config.googleGeminiApiKey })('gemini-2.5-flash'),
      prompt: `Generate a short, descriptive title for this document (max 60 characters).
Rules: no quotes, no generic titles like "Untitled" or "My Document",
no explanation — just the title on a single line. Not too formal, this is a peronsal journal.

Document content:
${promptText}`,
    });

    const now = new Date().toISOString();
    const [updated] = await database
      .update(documents)
      .set({
        title: generatedTitle.trim(),
        isTitleManual: false,
        titleGeneratedFromBlockIds: blockIds,
        updatedAt: now,
      })
      .where(eq(documents.id, id))
      .returning();

    return updated;
  } catch (error) {
    console.warn('[auto-title] Title generation failed:', error);
    return doc;
  }
}
