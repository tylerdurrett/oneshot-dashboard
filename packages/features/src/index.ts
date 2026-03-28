// ---------------------------------------------------------------------------
// Feature flag definitions and helpers.
// Pure functions only — no filesystem access. Consumers read the config file
// themselves and pass the raw value through parseFeatures().
// ---------------------------------------------------------------------------

export const FEATURE_NAMES = ['timers', 'chat', 'video'] as const;

export type FeatureName = (typeof FEATURE_NAMES)[number];

export type FeatureFlags = Record<FeatureName, boolean>;

/** All features enabled — the default when no config is provided. */
export const DEFAULT_FEATURES: FeatureFlags = {
  timers: true,
  chat: true,
  video: true,
};

/**
 * Parse a raw `features` value from project.config.json into a typed
 * FeatureFlags object. Missing or non-boolean keys default to `true`
 * (enabled) so existing repos work without config changes.
 */
export function parseFeatures(raw: unknown): FeatureFlags {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_FEATURES };
  const obj = raw as Record<string, unknown>;
  const result = {} as Record<string, boolean>;
  for (const name of FEATURE_NAMES) {
    result[name] = typeof obj[name] === 'boolean' ? obj[name] : true;
  }
  return result as FeatureFlags;
}

/** Maps each feature to its default landing route. */
const HOME_PATHS: Record<FeatureName, string> = {
  timers: '/timers/remaining',
  chat: '/chat',
  video: '/video',
};

/**
 * Return the home redirect path — the first enabled feature's landing page,
 * or `/no-features` when everything is off.
 */
export function getHomeRedirectPath(features: FeatureFlags): string {
  for (const name of FEATURE_NAMES) {
    if (features[name]) return HOME_PATHS[name];
  }
  return '/no-features';
}
