/**
 * useGdprConsent.ts
 *
 * Handles Google UMP (User Messaging Platform) consent collection for GDPR/EEA.
 * Must be called once at app start, before any ads are loaded.
 *
 * Uses the same lazy-load pattern as useAdMob — never imports
 * react-native-google-mobile-ads at module level to avoid crashing Expo Go.
 */
import { useEffect } from 'react';
import Constants from 'expo-constants';

const IS_EXPO_GO = Constants.appOwnership === 'expo';

type AdModule = typeof import('react-native-google-mobile-ads');
let adModuleCache: AdModule | null = null;

async function getAdModule(): Promise<AdModule | null> {
  if (IS_EXPO_GO) return null;
  if (adModuleCache) return adModuleCache;
  try {
    adModuleCache = await import('react-native-google-mobile-ads');
    return adModuleCache;
  } catch {
    return null;
  }
}

export function useGdprConsent() {
  useEffect(() => {
    if (IS_EXPO_GO) return;

    async function requestConsent() {
      const mod = await getAdModule();
      if (!mod) return;

      const { AdsConsent, AdsConsentStatus } = mod;

      try {
        // Step 1: Update consent info — determines if the form is required
        await AdsConsent.requestInfoUpdate();

        const info = await AdsConsent.getConsentInfo();

        // Only show the form if it's required (EEA users) and not yet obtained
        if (
          info.isConsentFormAvailable &&
          info.status === AdsConsentStatus.REQUIRED
        ) {
          // Step 2: Load and show the consent form
          await AdsConsent.loadAndShowConsentFormIfRequired();
        }

        // Step 3: Check final consent status
        const finalInfo = await AdsConsent.getConsentInfo();

        // Only initialise MobileAds if consent is granted or not required
        // (non-EEA users don't need to consent)
        if (
          finalInfo.status === AdsConsentStatus.OBTAINED ||
          finalInfo.status === AdsConsentStatus.NOT_REQUIRED
        ) {
          await mod.MobileAds().initialize();
        }
      } catch {
        // Non-fatal — if UMP fails, still try to initialise ads
        // (non-personalised ads can show without consent in some regions)
        try {
          await mod.MobileAds().initialize();
        } catch {
          // Ads unavailable in this environment
        }
      }
    }

    requestConsent();
  }, []);
}