import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra;

function get(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export const env = {
  API_URL: get(extra?.apiUrl),

  PROJECT_ID: get(extra?.eas?.projectId),

  ADMOB_INTERSTITIAL_ID: get(extra?.admobInterstitialId),
  ADMOB_REWARDED_ID: get(extra?.admobRewardedId),
  ADMOB_ANDROID_APP_ID: get(extra?.admobAndroidAppId),
  ADMOB_IOS_APP_ID: get(extra?.admobIosAppId),

  IS_DEV: process.env.NODE_ENV !== 'production',
} as const;

export const missingVars = [
  !env.API_URL && 'EXPO_PUBLIC_API_URL',
].filter(Boolean) as string[];