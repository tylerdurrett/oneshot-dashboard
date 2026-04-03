# Database

The `packages/db/` package provides a ready-to-use database layer with [Drizzle ORM](https://orm.drizzle.team/) and PostgreSQL (with pgvector for future vector/embedding features).

## Getting Started

Start the database:

```bash
pnpm db:up
```

This runs `docker compose up -d`, which starts a PostgreSQL 17 container with the pgvector extension pre-installed. The container uses a named volume (`pgdata`) so your data persists across restarts.

To stop it:

```bash
pnpm db:down
```

## Using the Database

Import `db` and your tables in your app:

```tsx
import { db, timerBuckets } from '@repo/db';
import { eq } from 'drizzle-orm';

// Insert a bucket
await db.insert(timerBuckets).values({ name: 'Study', totalMinutes: 120, colorIndex: 0, daysOfWeek: [1, 2, 3, 4, 5], sortOrder: 0 });

// Query buckets
const allBuckets = await db.select().from(timerBuckets);
```

Everything is type-safe — your editor will autocomplete column names and catch typos at compile time.

## Defining Tables

Tables are defined in `packages/db/src/schema.ts` using Drizzle's schema builder:

```typescript
import { pgTable, integer, text, uuid, timestamp } from 'drizzle-orm/pg-core';

export const myTable = pgTable('my_table', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
});
```

> **Tip:** Just tell Claude Code what you need — "Add a posts table with title, body, and a foreign key to users" — and it'll create the schema, generate the migration, and apply it.

## Migrations

When you change your schema, you need to generate and apply a migration:

```bash
# Generate a migration from your schema changes
pnpm --filter @repo/db db:generate

# Apply pending migrations
pnpm --filter @repo/db db:migrate
```

Migrations are stored in `packages/db/drizzle/` and are committed to git so everyone stays in sync.

## Renaming Columns

`drizzle-kit generate` can't tell the difference between "renamed a column" and "deleted one column, added another." It will ask interactively, which doesn't work in agent or CI environments.

**Use a two-step migration instead:**

1. **Add the new column** alongside the old one in `schema.ts`. Run `db:generate` + `db:migrate`. No prompt.
2. **Remove the old column** from `schema.ts`. Run `db:generate` + `db:migrate`. No prompt.

> **Never hand-write migration SQL or snapshot files.** Let drizzle-kit generate everything so snapshots stay in sync.

## Configuration

The database connection is configured via the `DATABASE_URL` environment variable:

```bash
DATABASE_URL=postgresql://oneshot:oneshot@localhost:5432/oneshot   # Default
```

Tests use `TEST_DATABASE_URL`, which defaults to the `oneshot_test` database (created automatically by Docker Compose's init script).

## Backups

Backups happen automatically before migrations run. They use `pg_dump` and are stored in `packages/db/backups/`. The last 5 backups are kept.

To restore from a backup:

```bash
pnpm db:restore           # Restores the latest backup
pnpm db:restore <file>    # Restores a specific backup file
```

## pgvector

The initial migration enables the `vector` extension. This is available for future use with embeddings and semantic search — no vector columns are defined yet, but the extension is ready when needed.

## Testing

Tests run against the `oneshot_test` database. Make sure Postgres is running (`pnpm db:up`) before running tests:

```bash
pnpm test
```
