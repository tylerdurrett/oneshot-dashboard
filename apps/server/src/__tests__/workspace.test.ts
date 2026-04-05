import { eq, isNull } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { documents, workspaces } from '@repo/db';
import { ensureDefaultWorkspace, backfillManualTitles } from '../services/workspace.js';
import { createCleanTestDb } from './test-db.js';
import type { Database } from '../services/thread.js';

describe('workspace service', () => {
  let testDb: Database;

  beforeEach(async () => {
    testDb = await createCleanTestDb('documents, workspaces');
  });

  describe('ensureDefaultWorkspace', () => {
    it('creates a default workspace when none exists', async () => {
      const result = await ensureDefaultWorkspace(testDb);

      expect(result.seeded).toBe(true);
      expect(result.workspaceId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );

      // Verify it's in the database with isDefault = true
      const [ws] = await testDb
        .select()
        .from(workspaces)
        .where(eq(workspaces.isDefault, true));
      expect(ws).toBeDefined();
      expect(ws!.name).toBe('Default');
    });

    it('is idempotent — second call does not create a duplicate', async () => {
      const first = await ensureDefaultWorkspace(testDb);
      const second = await ensureDefaultWorkspace(testDb);

      expect(first.seeded).toBe(true);
      expect(second.seeded).toBe(false);
      expect(first.workspaceId).toBe(second.workspaceId);

      // Only one workspace should exist
      const all = await testDb.select().from(workspaces);
      expect(all).toHaveLength(1);
    });

    it('assigns orphaned docs to the default workspace', async () => {
      // Create a document with no workspace
      const now = new Date().toISOString();
      await testDb.insert(documents).values({
        content: [],
        title: 'Existing Doc',
        createdAt: now,
        updatedAt: now,
      });

      const { workspaceId } = await ensureDefaultWorkspace(testDb);

      // Doc should now have the workspace assigned
      const [doc] = await testDb.select().from(documents);
      expect(doc!.workspaceId).toBe(workspaceId);
      // Title should be preserved since it was already set
      expect(doc!.title).toBe('Existing Doc');
    });

    it('gives untitled orphaned docs a date-based title', async () => {
      const createdAt = '2026-03-15T10:30:00.000Z';
      await testDb.insert(documents).values({
        content: [],
        title: '', // empty = untitled
        createdAt,
        updatedAt: createdAt,
      });

      await ensureDefaultWorkspace(testDb);

      const [doc] = await testDb.select().from(documents);
      expect(doc!.title).toBe('Notes 2026-03-15');
    });

    it('does not modify docs that already have a workspace', async () => {
      // Seed workspace first
      const { workspaceId } = await ensureDefaultWorkspace(testDb);

      // Create a doc already assigned to the workspace
      const now = new Date().toISOString();
      await testDb.insert(documents).values({
        content: [],
        title: 'Already Assigned',
        workspaceId,
        createdAt: now,
        updatedAt: now,
      });

      // Run again — should not touch the doc
      await ensureDefaultWorkspace(testDb);

      const orphans = await testDb
        .select()
        .from(documents)
        .where(isNull(documents.workspaceId));
      expect(orphans).toHaveLength(0);

      const [doc] = await testDb.select().from(documents);
      expect(doc!.title).toBe('Already Assigned');
    });
  });

  describe('backfillManualTitles', () => {
    it('sets isTitleManual = true for docs with custom titles', async () => {
      // Seed a workspace first so we can create docs
      const { workspaceId } = await ensureDefaultWorkspace(testDb);
      const now = new Date().toISOString();

      await testDb.insert(documents).values([
        {
          title: 'My Custom Title',
          content: [],
          workspaceId,
          createdAt: now,
          updatedAt: now,
        },
        {
          title: 'Project Roadmap 2026',
          content: [],
          workspaceId,
          createdAt: now,
          updatedAt: now,
        },
      ]);

      const updated = await backfillManualTitles(testDb);

      expect(updated).toBe(2);

      const docs = await testDb.select().from(documents);
      for (const doc of docs) {
        expect(doc.isTitleManual).toBe(true);
      }
    });

    it('leaves docs with default "Notes YYYY-MM-DD" titles as isTitleManual = false', async () => {
      const { workspaceId } = await ensureDefaultWorkspace(testDb);
      const now = new Date().toISOString();

      await testDb.insert(documents).values([
        {
          title: 'Notes 2026-04-04',
          content: [],
          workspaceId,
          createdAt: now,
          updatedAt: now,
        },
        {
          title: 'Notes 2025-12-31',
          content: [],
          workspaceId,
          createdAt: now,
          updatedAt: now,
        },
        {
          title: '', // untitled
          content: [],
          workspaceId,
          createdAt: now,
          updatedAt: now,
        },
      ]);

      const updated = await backfillManualTitles(testDb);

      expect(updated).toBe(0);

      const docs = await testDb
        .select()
        .from(documents)
        .where(eq(documents.workspaceId, workspaceId));
      for (const doc of docs) {
        expect(doc.isTitleManual).toBe(false);
      }
    });

    it('is idempotent — second run changes nothing', async () => {
      const { workspaceId } = await ensureDefaultWorkspace(testDb);
      const now = new Date().toISOString();

      await testDb.insert(documents).values({
        title: 'Custom Title',
        content: [],
        workspaceId,
        createdAt: now,
        updatedAt: now,
      });

      const firstRun = await backfillManualTitles(testDb);
      expect(firstRun).toBe(1);

      const secondRun = await backfillManualTitles(testDb);
      expect(secondRun).toBe(0);
    });
  });
});
