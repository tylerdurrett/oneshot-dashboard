import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock AudioContext
// ---------------------------------------------------------------------------

function createMockOscillator() {
  return {
    type: 'sine',
    frequency: { value: 0 },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
}

function createMockGain() {
  return {
    gain: {
      value: 1,
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
  };
}

function createMockAudioContext(state: AudioContextState = 'running') {
  return {
    currentTime: 0,
    state,
    destination: {},
    resume: vi.fn().mockResolvedValue(undefined),
    createOscillator: vi.fn(createMockOscillator),
    createGain: vi.fn(createMockGain),
  };
}

describe('playCompletionChime', () => {
  let originalAudioContext: typeof globalThis.AudioContext;

  beforeEach(() => {
    originalAudioContext = globalThis.AudioContext;
  });

  afterEach(() => {
    globalThis.AudioContext = originalAudioContext;
    // Force a fresh AudioContext on next call by clearing the module-level cache.
    // We do this by re-importing, but since vitest caches modules we reset the
    // singleton via a fresh mock each time.
    vi.resetModules();
  });

  it('creates two oscillators for the two-note chime', async () => {
    const mockCtx = createMockAudioContext();
    globalThis.AudioContext = vi.fn(() => mockCtx) as unknown as typeof AudioContext;

    // Re-import to pick up the fresh AudioContext
    const { playCompletionChime: play } = await import('../_lib/sounds');
    play();

    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(2);
    expect(mockCtx.createGain).toHaveBeenCalledTimes(2);
  });

  it('connects oscillators through gain to destination', async () => {
    const mockCtx = createMockAudioContext();
    globalThis.AudioContext = vi.fn(() => mockCtx) as unknown as typeof AudioContext;

    const { playCompletionChime: play } = await import('../_lib/sounds');
    play();

    const osc = mockCtx.createOscillator.mock.results[0]!.value;
    const gain = mockCtx.createGain.mock.results[0]!.value;

    expect(osc.connect).toHaveBeenCalledWith(gain);
    expect(gain.connect).toHaveBeenCalledWith(mockCtx.destination);
  });

  it('resumes a suspended audio context', async () => {
    const mockCtx = createMockAudioContext('suspended');
    globalThis.AudioContext = vi.fn(() => mockCtx) as unknown as typeof AudioContext;

    const { playCompletionChime: play } = await import('../_lib/sounds');
    play();

    expect(mockCtx.resume).toHaveBeenCalled();
  });

  it('does not throw when AudioContext is unavailable', async () => {
    // @ts-expect-error — simulating missing API
    globalThis.AudioContext = undefined;

    // Re-import so the module-level singleton is null and getAudioContext()
    // actually hits the !window.AudioContext guard.
    const { playCompletionChime: play } = await import('../_lib/sounds');
    expect(() => play()).not.toThrow();
  });

  it('does not throw when resume rejects', async () => {
    const mockCtx = createMockAudioContext('suspended');
    mockCtx.resume = vi.fn().mockRejectedValue(new Error('NotAllowed'));
    globalThis.AudioContext = vi.fn(() => mockCtx) as unknown as typeof AudioContext;

    const { playCompletionChime: play } = await import('../_lib/sounds');

    expect(() => play()).not.toThrow();
  });

  it('starts and stops oscillators at correct times', async () => {
    const mockCtx = createMockAudioContext();
    mockCtx.currentTime = 10;
    globalThis.AudioContext = vi.fn(() => mockCtx) as unknown as typeof AudioContext;

    const { playCompletionChime: play } = await import('../_lib/sounds');
    play();

    const osc1 = mockCtx.createOscillator.mock.results[0]!.value;
    const osc2 = mockCtx.createOscillator.mock.results[1]!.value;

    // Note 1 starts at currentTime (10), note 2 starts 0.15s later
    expect(osc1.start).toHaveBeenCalledWith(10);
    expect(osc2.start).toHaveBeenCalledWith(10.15);

    // Each oscillator stops after its duration
    expect(osc1.stop).toHaveBeenCalledWith(10.3);
    expect(osc2.stop).toHaveBeenCalledWith(10.55);
  });
});
