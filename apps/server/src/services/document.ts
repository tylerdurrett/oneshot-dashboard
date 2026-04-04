import { desc, eq, sql } from 'drizzle-orm';
import { db as defaultDb, documents } from '@repo/db';
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

/** Update a document's title and bump updatedAt. */
export async function updateDocumentTitle(
  id: string,
  title: string,
  database: Database = defaultDb,
): Promise<DocumentRow | undefined> {
  const now = new Date().toISOString();
  const [updated] = await database
    .update(documents)
    .set({ title, updatedAt: now })
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
