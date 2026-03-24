import { describe, expect, it, vi } from 'vitest';

// redirect() throws a NEXT_REDIRECT error in Next.js — mock it to capture the call
const mockRedirect = vi.fn();
vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => {
    mockRedirect(...args);
    throw new Error('NEXT_REDIRECT');
  },
}));

describe('Home page', () => {
  it('redirects to /timers', async () => {
    const { default: Home } = await import('../app/page');
    expect(() => Home()).toThrow('NEXT_REDIRECT');
    expect(mockRedirect).toHaveBeenCalledWith('/timers');
  });
});
