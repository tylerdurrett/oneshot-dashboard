import { describe, expect, it } from 'vitest';
import { formatTimeAgo } from '../format-time-ago';

describe('formatTimeAgo', () => {
  it('returns "just now" for timestamps less than 60 seconds ago', () => {
    const now = Date.now() / 1000;
    expect(formatTimeAgo(now)).toBe('just now');
    expect(formatTimeAgo(now - 30)).toBe('just now');
  });

  it('returns "just now" for future timestamps', () => {
    const future = Date.now() / 1000 + 3600;
    expect(formatTimeAgo(future)).toBe('just now');
  });

  it('returns minutes ago', () => {
    const now = Date.now() / 1000;
    expect(formatTimeAgo(now - 120)).toBe('2m ago');
    expect(formatTimeAgo(now - 59 * 60)).toBe('59m ago');
  });

  it('returns hours ago', () => {
    const now = Date.now() / 1000;
    expect(formatTimeAgo(now - 3600)).toBe('1h ago');
    expect(formatTimeAgo(now - 23 * 3600)).toBe('23h ago');
  });

  it('returns days ago', () => {
    const now = Date.now() / 1000;
    expect(formatTimeAgo(now - 86400)).toBe('1d ago');
    expect(formatTimeAgo(now - 6 * 86400)).toBe('6d ago');
  });

  it('returns weeks ago', () => {
    const now = Date.now() / 1000;
    expect(formatTimeAgo(now - 7 * 86400)).toBe('1w ago');
    expect(formatTimeAgo(now - 21 * 86400)).toBe('3w ago');
  });

  it('returns months ago', () => {
    const now = Date.now() / 1000;
    expect(formatTimeAgo(now - 60 * 86400)).toBe('2mo ago');
    expect(formatTimeAgo(now - 300 * 86400)).toBe('10mo ago');
  });

  it('returns years ago', () => {
    const now = Date.now() / 1000;
    expect(formatTimeAgo(now - 400 * 86400)).toBe('1y ago');
    expect(formatTimeAgo(now - 800 * 86400)).toBe('2y ago');
  });
});
