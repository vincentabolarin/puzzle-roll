/**
 * env.ts — validated environment variables for the mobile app
 */

type EnvValidation = {
  valid: boolean;
  errors: string[];
};

function required(key: string): string | undefined {
  return process.env[key];
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const env = {
  API_URL: required("EXPO_PUBLIC_API_URL"),
  PROJECT_ID: optional("EXPO_PUBLIC_PROJECT_ID", ""),
  ADMOB_INTERSTITIAL_ID: optional("EXPO_PUBLIC_ADMOB_INTERSTITIAL_ID", ""),
  ADMOB_REWARDED_ID: optional("EXPO_PUBLIC_ADMOB_REWARDED_ID", ""),
  IS_DEV: process.env.NODE_ENV !== "production",
} as const;

export function validateEnv(): EnvValidation {
  const errors: string[] = [];

  if (!env.API_URL) {
    errors.push(
      "Missing EXPO_PUBLIC_API_URL. Add it to .env or EAS build environment."
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}