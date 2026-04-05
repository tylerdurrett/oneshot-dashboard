import { and, eq, isNull, or, sql, not } from 'drizzle-orm';
import { db as defaultDb, workspaces, documents } from '@repo/db';
import type { Database } from './thread.js';

/** Format a date as a default document title: "Notes 2026-04-04" */
export function titleFromDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `Notes ${d.toISOString().slice(0, 10)}`;
}

/** Get the default workspace ID (if one has been seeded). */
export async function getDefaultWorkspaceId(
  database: Database = defaultDb,
): Promise<string | undefined> {
  const [ws] = await database
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.isDefault, true))
    .limit(1);
  return ws?.id;
}

/**
 * Ensure a default workspace exists and backfill orphaned documents.
 * Called once on server startup — idempotent, safe to call multiple times.
 */
export async function ensureDefaultWorkspace(
  database: Database = defaultDb,
): Promise<{ workspaceId: string; seeded: boolean }> {
  const existingId = await getDefaultWorkspaceId(database);

  if (existingId) {
    return { workspaceId: existingId, seeded: false };
  }

  const now = new Date().toISOString();
  const [inserted] = await database
    .insert(workspaces)
    .values({
      name: 'Default',
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!inserted) throw new Error('Failed to create default workspace');

  // Backfill orphaned docs created before workspaces existed
  await backfillOrphanedDocs(inserted.id, database);
  return { workspaceId: inserted.id, seeded: true };
}

/**
 * Backfill `isTitleManual = true` for docs that were manually titled before the column existed.
 * Targets docs where `isTitleManual` is false AND the title doesn't match the default
 * "Notes YYYY-MM-DD" pattern. Idempotent — returns 0 on subsequent runs.
 */
export async function backfillManualTitles(
  database: Database = defaultDb,
): Promise<number> {
  const now = new Date().toISOString();
  const result = await database
    .update(documents)
    .set({ isTitleManual: true, updatedAt: now })
    .where(
      and(
        eq(documents.isTitleManual, false),
        sql`${documents.title} !~ '^Notes \\d{4}-\\d{2}-\\d{2}$'`,
        // Exclude untitled docs — they were never manually titled
        not(eq(documents.title, '')),
      ),
    )
    .returning({ id: documents.id });

  return result.length;
}

/** Bulk-assign orphaned docs to a workspace and title untitled ones. */
async function backfillOrphanedDocs(
  workspaceId: string,
  database: Database,
): Promise<void> {
  const now = new Date().toISOString();

  // Assign all orphaned docs to the workspace
  await database
    .update(documents)
    .set({ workspaceId, updatedAt: now })
    .where(isNull(documents.workspaceId));

  // Title any untitled docs with a date-based name
  // Uses raw SQL for to_char since we need the per-row created_at value
  await database
    .update(documents)
    .set({
      title: sql`'Notes ' || to_char(${documents.createdAt}, 'YYYY-MM-DD')`,
      updatedAt: now,
    })
    .where(
      and(
        eq(documents.workspaceId, workspaceId),
        or(eq(documents.title, ''), isNull(documents.title)),
      ),
    );
}
