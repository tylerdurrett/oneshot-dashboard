import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const html = readFileSync(
  resolve(__dirname, '../../index.html'),
  'utf-8',
);

describe('PWA meta tags in index.html', () => {
  it('links the web app manifest', () => {
    expect(html).toContain('rel="manifest"');
  });

  it('sets apple-mobile-web-app-capable', () => {
    expect(html).toContain(
      'name="apple-mobile-web-app-capable" content="yes"',
    );
  });

  it('sets apple-mobile-web-app-status-bar-style', () => {
    expect(html).toContain(
      'name="apple-mobile-web-app-status-bar-style" content="black"',
    );
  });

  it('sets apple-mobile-web-app-title', () => {
    expect(html).toContain('name="apple-mobile-web-app-title"');
  });

  it('links apple-touch-icon', () => {
    expect(html).toContain('rel="apple-touch-icon"');
  });

  it('sets theme-color', () => {
    expect(html).toContain('name="theme-color"');
  });
});
