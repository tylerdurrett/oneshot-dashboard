# Database

The `packages/db/` package provides a ready-to-use database layer with [Drizzle ORM](https://orm.drizzle.team/) and SQLite. No servers to run, no Docker containers — just a local file.

## How It Works

- **Drizzle ORM** handles queries with full TypeScript type safety
- **SQLite** (via libsql) stores data in a local file (`local.db`)
- **Migrations** let you evolve your database schema over time

The database file is gitignored, so each developer gets their own local copy.

## Using the Database

Import `db` and your tables in your app:

```tsx
import { db, users } from '@repo/db';
import { eq } from 'drizzle-orm';

// Insert a user
await db.insert(users).values({ name: 'Alice', email: 'alice@example.com' });

// Query users
const allUsers = await db.select().from(users);

// Query with a filter
const alice = await db.select().from(users).where(eq(users.email, 'alice@example.com'));
```

Everything is type-safe — your editor will autocomplete column names and catch typos at compile time.

## Defining Tables

Tables are defined in `packages/db/src/schema.ts` using Drizzle's schema builder:

```typescript
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
});
```

The starter kit includes a `users` table as an example. Add your own tables in the same file, or create new files and export them from `packages/db/src/index.ts`.

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

### Quick Schema Push (Development Only)

During rapid development, you can skip migrations and push schema changes directly:

```bash
pnpm --filter @repo/db db:push
```

This updates your local database to match the schema without creating a migration file. Handy for prototyping, but use proper migrations for anything you want to keep.

## Configuration

The database connection is configured via the `DATABASE_URL` environment variable:

```bash
DATABASE_URL=file:local.db   # Default — a local SQLite file
```

If you don't set this variable, it defaults to `file:local.db` in the project root.

## Testing

The database package includes tests that verify the schema exports and client initialization:

```bash
pnpm --filter @repo/db test
```
