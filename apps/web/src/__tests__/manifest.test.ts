import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { APP_TITLE } from '../app/route-metadata';

const manifest = JSON.parse(
  readFileSync(resolve(__dirname, '../../public/manifest.json'), 'utf-8'),
);

describe('web app manifest', () => {
  it('has standalone display mode', () => {
    expect(manifest.display).toBe('standalone');
  });

  it('has the correct app name', () => {
    expect(manifest.name).toBe(APP_TITLE);
  });

  it('has a start_url', () => {
    expect(manifest.start_url).toBe('/');
  });

  it('has required icon sizes', () => {
    const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
  });
});
