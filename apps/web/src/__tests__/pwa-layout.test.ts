import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  resolve(__dirname, '../app/globals.css'),
  'utf-8',
);

describe('PWA standalone shell layout', () => {
  it('defines a shared bottom-nav gutter token', () => {
    expect(css).toContain('--mobile-bottom-nav-gutter: 12px;');
  });

  it('adds the shared gutter to the standalone shell main padding', () => {
    expect(css).toContain(
      'padding-bottom: calc(var(--mobile-bottom-nav-height) + var(--mobile-bottom-nav-gutter));',
    );
  });

  it('does not keep a timers-only standalone content gutter rule', () => {
    expect(css).not.toContain('.app-shell-standalone .timers-content');
  });
});
