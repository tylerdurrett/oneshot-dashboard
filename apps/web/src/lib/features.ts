import {
  type FeatureFlags,
  getHomeRedirectPath as _getHomeRedirectPath,
} from '@repo/features';

import { AREA_STORAGE_KEY } from '@/lib/area-storage';

/**
 * Feature flags injected at build time from project.config.json.
 * Defaults to all-enabled when Vite define values are missing (e.g. in tests).
 */
export const features: FeatureFlags = {
  timers: import.meta.env.VITE_FEATURE_TIMERS ?? true,
  chat: import.meta.env.VITE_FEATURE_CHAT ?? true,
  video: import.meta.env.VITE_FEATURE_VIDEO ?? true,
};

/**
 * Default landing paths per area — kept here (not in app-areas.ts) to avoid
 * circular imports (features → app-areas → nav-items → features).
 */
const AREA_HOME_PATHS: Record<string, string> = {
  timers: '/timers/remaining',
  docs: '/docs',
};

/**
 * The landing path for the home redirect. Checks localStorage for a
 * previously stored area and returns that area's first page.
 * Falls back to the first enabled feature or /no-features.
 */
export function getHomeRedirectPath(): string {
  try {
    const storedAreaId = localStorage.getItem(AREA_STORAGE_KEY);
    if (storedAreaId && storedAreaId in AREA_HOME_PATHS) {
      return AREA_HOME_PATHS[storedAreaId]!;
    }
  } catch {
    // localStorage unavailable (SSR, privacy mode, etc.)
  }
  return _getHomeRedirectPath(features);
}
