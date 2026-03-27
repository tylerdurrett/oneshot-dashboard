import { describe, expect, it } from 'vitest';

import { ALL_TIMERS_TITLE, APP_TITLE, CHAT_TITLE, TIMERS_TITLE } from '../app/route-metadata';

describe('route metadata', () => {
  it('exports the app title', () => {
    expect(APP_TITLE).toBe('Tdog Dashboard');
  });

  it('exports the timers page title', () => {
    expect(TIMERS_TITLE).toBe('Timers');
  });

  it('exports the all timers page title', () => {
    expect(ALL_TIMERS_TITLE).toBe('All Timers');
  });

  it('exports the chat page title', () => {
    expect(CHAT_TITLE).toBe('Chat');
  });
});
