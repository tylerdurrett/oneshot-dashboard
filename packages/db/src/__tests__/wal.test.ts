import { describe, expect, it } from 'vitest';

import { enableWalMode, getJournalMode } from '../index';

describe('WAL mode', () => {
  it('enableWalMode() runs without throwing', async () => {
    const mode = await enableWalMode();
    expect(typeof mode).toBe('string');
    expect(mode.length).toBeGreaterThan(0);
  });

  it('getJournalMode() returns a string', async () => {
    const mode = await getJournalMode();
    expect(typeof mode).toBe('string');
    expect(mode.length).toBeGreaterThan(0);
  });

  it('enableWalMode() returns a valid journal mode value', async () => {
    const mode = await enableWalMode();
    // In-memory databases return "memory", file databases return "wal"
    const validModes = ['wal', 'memory', 'delete', 'truncate', 'persist', 'off'];
    expect(validModes).toContain(mode);
  });
});
