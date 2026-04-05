# Testing

Tests use Vitest. Each package has its own `vitest.config.ts` for Turbo cache compatibility.

## Running Tests

```bash
# Run all tests for a package
pnpm --filter @repo/server test

# Run a specific test file
cd apps/server && npx vitest run src/__tests__/my-test.test.ts

# Run tests matching a name
cd apps/server && npx vitest run -t 'my test name'
```

`npx vitest` only works from within a package directory (e.g., `apps/server`), not from the repo root.

## Server Test Database

Server tests (`apps/server`) hit a real Postgres instance — no mocking the database. The test DB is `oneshot_test` (separate from the dev DB `oneshot`). Connection setup lives in `apps/server/src/__tests__/test-db.ts`:

- Singleton connection, max 5 pool connections
- Migrations run once on first use
- Each test truncates only the tables it needs via `createCleanTestDb('table1, table2')`
- File parallelism is **disabled** in the server vitest config (shared DB)

Docker must be running (`pnpm db:up`) for server tests to work.

## Postgres Gotchas

### UUID columns reject non-UUID strings

The `id` columns use Postgres `uuid` type. If you pass a non-UUID string like `'nonexistent-id'` in a test, Postgres throws a cast error (`invalid input syntax for type uuid`) before your app logic runs. Use a valid nil UUID instead:

```typescript
// ✗ Causes Postgres error — never reaches your "not found" logic
await getBucket('nonexistent-id', testDb);

// ✓ Valid UUID, guaranteed absent — your app returns undefined/404
await getBucket('00000000-0000-0000-0000-000000000000', testDb);
```

### Timestamp format mismatch

JS `toISOString()` returns `2026-03-24T10:00:00.123Z` (with `T` separator and `Z` suffix). Postgres returns `2026-03-24 10:00:00.123+00` (space separator, `+00` suffix). **String comparison with `>` or `<` breaks** because `T` > space in ASCII.

Always compare timestamps as Date objects:

```typescript
// ✗ Broken — format differences make string comparison unreliable
expect(updated!.updatedAt > original.updatedAt).toBe(true);

// ✓ Correct — parse both into Date objects first
expect(new Date(updated!.updatedAt).getTime())
  .toBeGreaterThan(new Date(original.updatedAt).getTime());
```

## Fake Timers + Postgres

If you're writing tests that use `vi.useFakeTimers()` alongside real database calls, there are three critical rules:

### 1. Set up DB connections before installing fake timers

The postgres driver uses `setImmediate` and `setTimeout` internally for connection management. Fake those and the driver hangs.

```typescript
beforeEach(async () => {
  testDb = await createTimerTestDb();  // ← real timers
  vi.useFakeTimers(FAKE_OPTS);         // ← install fakes AFTER
});
```

### 2. Only fake what you need

The default `vi.useFakeTimers()` fakes `setImmediate`, which postgres needs for socket I/O. Only fake the APIs your test actually requires:

```typescript
const FAKE_OPTS = {
  toFake: ['setTimeout', 'clearTimeout', 'Date'] as const,
};
```

This lets `vi.setSystemTime()` and `vi.advanceTimersByTimeAsync()` work while keeping the postgres driver functional.

### 3. Flush after advancing timers that trigger async callbacks

If a `setTimeout` callback makes a DB call (e.g., updating a row), `vi.advanceTimersByTimeAsync()` fires the callback but doesn't wait for the async I/O to complete. Use `node:timers/promises` to add a real-time flush — vitest doesn't fake this module:

```typescript
import { setTimeout as realDelay } from 'node:timers/promises';

const flush = () => realDelay(100);

async function advance(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  await flush();
}
```

See `apps/server/src/__tests__/timer-scheduler.test.ts` for a working example of all three patterns together.
