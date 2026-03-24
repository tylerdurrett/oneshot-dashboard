// Timer sound effects

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined' || !window.AudioContext) return null;
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

/**
 * Play a short two-note ascending chime to signal timer completion.
 *
 * Uses the Web Audio API to synthesize the sound — no mp3 file required.
 * Silently no-ops if the browser blocks autoplay or the API is unavailable.
 */
export function playCompletionChime(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    // Resume suspended context (autoplay policy) — fire-and-forget
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const now = ctx.currentTime;

    // Note 1: C6 (1047 Hz) — starts immediately, fades over 0.3s
    playTone(ctx, 1047, now, 0.3, 0.15);

    // Note 2: E6 (1319 Hz) — starts 0.15s later, fades over 0.4s
    playTone(ctx, 1319, now + 0.15, 0.4, 0.15);
  } catch {
    // Silently ignore — audio is a nice-to-have, not critical
  }
}

/** Play a single sine-wave tone with exponential decay. */
function playTone(
  ctx: AudioContext,
  frequency: number,
  startTime: number,
  duration: number,
  volume: number,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.value = frequency;

  gain.gain.setValueAtTime(volume, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(startTime);
  osc.stop(startTime + duration);
}
