import { describe, expect, it } from 'vitest';

import { APP_TITLE, CHAT_TITLE, TIMERS_TITLE } from '../app/route-metadata';

describe('route metadata', () => {
  it('exports the app title', () => {
    expect(APP_TITLE).toBe('Tdog Dashboard');
  });

  it('exports the timers page title', () => {
    expect(TIMERS_TITLE).toBe('Timers');
  });

  it('exports the chat page title', () => {
    expect(CHAT_TITLE).toBe('Chat');
  });
});
