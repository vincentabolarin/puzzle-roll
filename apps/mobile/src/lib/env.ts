/**
 * env.ts — validated environment variables for the mobile app.
 *
 * IMPORTANT: All EXPO_PUBLIC_* vars must be set at BUILD TIME in EAS,
 * not just at dev time. Add them to eas.json under each build profile's
 * "env" key, or as EAS secrets.
 *
 * We do NOT throw at module load time in production — a crash before the
 * root component renders gives no visible error to the user. Instead we
 * expose a `missingVars` array that _layout.tsx can check and show a
 * helpful error screen.
 */

function get(key: string): string {
  return process.env[key] ?? '';
}

export const env = {
  /** Base URL of the Puzzle Roll API e.g. https://api.puzzleroll.com/api */
  API_URL: get('EXPO_PUBLIC_API_URL'),

  /** EAS project ID — matches app.config.ts extra.eas.projectId */
  PROJECT_ID: get('EXPO_PUBLIC_PROJECT_ID'),

  /** AdMob unit IDs */
  ADMOB_INTERSTITIAL_ID: get('EXPO_PUBLIC_ADMOB_INTERSTITIAL_ID'),
  ADMOB_REWARDED_ID: get('EXPO_PUBLIC_ADMOB_REWARDED_ID'),
  ADMOB_ANDROID_APP_ID: get('EXPO_PUBLIC_ADMOB_ANDROID_APP_ID'),
  ADMOB_IOS_APP_ID: get('EXPO_PUBLIC_ADMOB_IOS_APP_ID'),

  IS_DEV: process.env.NODE_ENV !== 'production',
} as const;

/** Variables required for the app to function. Check this in _layout.tsx. */
export const missingVars = (['EXPO_PUBLIC_API_URL'] as const).filter(
  k => !process.env[k]
);