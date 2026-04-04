import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/features', () => ({
  features: { timers: true, chat: true, video: true },
}));

import { getAreaForPath, APP_AREAS } from '../app-areas';

describe('getAreaForPath', () => {
  it('returns Timers area for /timers/remaining', () => {
    expect(getAreaForPath('/timers/remaining').id).toBe('timers');
  });

  it('returns Timers area for /timers/all', () => {
    expect(getAreaForPath('/timers/all').id).toBe('timers');
  });

  it('returns Timers area for /chat', () => {
    expect(getAreaForPath('/chat').id).toBe('timers');
  });

  it('returns Timers area for /chat/some-thread', () => {
    expect(getAreaForPath('/chat/some-thread').id).toBe('timers');
  });

  it('returns Timers area for /settings', () => {
    expect(getAreaForPath('/settings').id).toBe('timers');
  });

  it('returns Docs area for /docs', () => {
    expect(getAreaForPath('/docs').id).toBe('docs');
  });

  it('returns Docs area for /docs/chat', () => {
    expect(getAreaForPath('/docs/chat').id).toBe('docs');
  });

  it('falls back to Timers area for unknown /docs sub-path', () => {
    // /docs uses exact match, so arbitrary sub-paths don't match
    expect(getAreaForPath('/docs/some-page').id).toBe('timers');
  });

  it('falls back to first area (Timers) for unknown paths', () => {
    expect(getAreaForPath('/unknown').id).toBe('timers');
  });

  it('falls back to first area for root path', () => {
    expect(getAreaForPath('/').id).toBe('timers');
  });
});

describe('APP_AREAS', () => {
  it('has at least two areas defined', () => {
    expect(APP_AREAS.length).toBeGreaterThanOrEqual(2);
  });

  it('Timers area has 4 navItems when all features enabled', () => {
    const timers = APP_AREAS.find((a) => a.id === 'timers');
    expect(timers?.navItems).toHaveLength(4);
  });

  it('Docs area has 2 navItems when chat is enabled', () => {
    const docs = APP_AREAS.find((a) => a.id === 'docs');
    expect(docs?.navItems).toHaveLength(2);
    expect(docs?.navItems[0]?.href).toBe('/docs');
    expect(docs?.navItems[1]?.href).toBe('/docs/chat');
  });
});
