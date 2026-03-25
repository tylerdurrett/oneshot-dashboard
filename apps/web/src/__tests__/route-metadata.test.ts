import { describe, expect, it } from 'vitest';

import { APP_TITLE, appMetadata, chatMetadata, timersMetadata } from '../app/route-metadata';

describe('route metadata', () => {
  it('uses the dashboard name as the default app title', () => {
    expect(APP_TITLE).toBe('Tdog Dashboard');
    expect(appMetadata.title).toBe(APP_TITLE);
  });

  it('sets the timers browser title', () => {
    expect(timersMetadata.title).toBe('Timers');
  });

  it('sets the chat browser title', () => {
    expect(chatMetadata.title).toBe('Chat');
  });
});
