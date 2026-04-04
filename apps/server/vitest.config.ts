import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Disable file parallelism — test files share a single Postgres database
    // and will race on TRUNCATE / INSERT if they run concurrently.
    fileParallelism: false,
  },
});
