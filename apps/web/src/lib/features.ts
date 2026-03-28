import {
  type FeatureFlags,
  getHomeRedirectPath as _getHomeRedirectPath,
} from '@repo/features';

/**
 * Feature flags injected at build time from project.config.json.
 * Defaults to all-enabled when Vite define values are missing (e.g. in tests).
 */
export const features: FeatureFlags = {
  timers: import.meta.env.VITE_FEATURE_TIMERS ?? true,
  chat: import.meta.env.VITE_FEATURE_CHAT ?? true,
  video: import.meta.env.VITE_FEATURE_VIDEO ?? true,
};

/** The landing path for the home redirect — first enabled feature or /no-features. */
export function getHomeRedirectPath(): string {
  return _getHomeRedirectPath(features);
}
