import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FEATURES,
  FEATURE_NAMES,
  getHomeRedirectPath,
  parseFeatures,
  type FeatureFlags,
} from '../index';

describe('parseFeatures', () => {
  it('returns all-true defaults for undefined input', () => {
    expect(parseFeatures(undefined)).toEqual(DEFAULT_FEATURES);
  });

  it('returns all-true defaults for null input', () => {
    expect(parseFeatures(null)).toEqual(DEFAULT_FEATURES);
  });

  it('returns all-true defaults for non-object input', () => {
    expect(parseFeatures('hello')).toEqual(DEFAULT_FEATURES);
    expect(parseFeatures(42)).toEqual(DEFAULT_FEATURES);
  });

  it('parses a fully-specified object', () => {
    expect(parseFeatures({ timers: false, chat: true, video: false })).toEqual({
      timers: false,
      chat: true,
      video: false,
    });
  });

  it('defaults missing keys to true', () => {
    expect(parseFeatures({ chat: false })).toEqual({
      timers: true,
      chat: false,
      video: true,
    });
  });

  it('defaults non-boolean values to true', () => {
    expect(parseFeatures({ timers: 'yes', chat: 0, video: null })).toEqual(
      DEFAULT_FEATURES,
    );
  });

  it('handles empty object', () => {
    expect(parseFeatures({})).toEqual(DEFAULT_FEATURES);
  });
});

describe('getHomeRedirectPath', () => {
  it('returns /timers/remaining when all features are enabled', () => {
    expect(getHomeRedirectPath(DEFAULT_FEATURES)).toBe('/timers/remaining');
  });

  it('returns /chat when timers is disabled', () => {
    expect(
      getHomeRedirectPath({ timers: false, chat: true, video: true }),
    ).toBe('/chat');
  });

  it('returns /video when timers and chat are disabled', () => {
    expect(
      getHomeRedirectPath({ timers: false, chat: false, video: true }),
    ).toBe('/video');
  });

  it('returns /no-features when all features are disabled', () => {
    expect(
      getHomeRedirectPath({ timers: false, chat: false, video: false }),
    ).toBe('/no-features');
  });
});

describe('FEATURE_NAMES', () => {
  it('contains all expected features', () => {
    expect([...FEATURE_NAMES]).toEqual(['timers', 'chat', 'video']);
  });
});
