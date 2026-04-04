import { eq } from 'drizzle-orm';
import { db as defaultDb, documents } from '@repo/db';
import type { Database } from './thread.js';

type DocumentRow = typeof documents.$inferSelect;

/** Return the single default document, creating it on first access. */
export async function getDefaultDocument(
  database: Database = defaultDb,
): Promise<DocumentRow> {
  const rows = await database.select().from(documents).limit(1);
  if (rows[0]) return rows[0];

  // Auto-create on first access so there's no need for a seed script
  const now = new Date().toISOString();
  const emptyContent: unknown[] = [];
  const [inserted] = await database
    .insert(documents)
    .values({ content: emptyContent, createdAt: now, updatedAt: now })
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
