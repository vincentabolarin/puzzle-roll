import { useCallback, useEffect, useRef } from 'react';
import Constants from 'expo-constants';
import { useAdsStore } from '../stores/ads.store';

// react-native-google-mobile-ads requires a custom dev build.
// Expo Go does not include native AdMob bindings — importing the module
// at the top level would crash the entire module graph.
// We lazy-load it only when we know we're running in a real native build.

const IS_EXPO_GO = Constants.appOwnership === 'expo';

// Lazy import type — only used for the type annotation, not evaluated at runtime
type AdModule = typeof import('react-native-google-mobile-ads');

type RewardedAdInstance = ReturnType<
  typeof import('react-native-google-mobile-ads')['RewardedAd']['createForAdRequest']
>;

type InterstitialAdInstance = ReturnType<
  typeof import('react-native-google-mobile-ads')['InterstitialAd']['createForAdRequest']
>;

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

const IS_DEV = process.env.NODE_ENV !== 'production';

const INTERSTITIAL_ID = IS_DEV
  ? 'ca-app-pub-3940256099942544/1033173712' // Google test ID
  : (process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ID ?? 'ca-app-pub-3940256099942544/1033173712');

const REWARDED_ID = IS_DEV
  ? 'ca-app-pub-3940256099942544/5224354917' // Google test ID
  : (process.env.EXPO_PUBLIC_ADMOB_REWARDED_ID ?? 'ca-app-pub-3940256099942544/5224354917');

export function useAdMob() {
  const { setRewardedAdReady, setInterstitialShowing, recordCompletion } = useAdsStore();
  // const rewardedRef = useRef<InstanceType<AdModule['RewardedAd']> | null>(null);
  // const interstitialRef = useRef<InstanceType<AdModule['InterstitialAd']> | null>(null);

  const rewardedRef = useRef<RewardedAdInstance | null>(null);
  const interstitialRef = useRef<InterstitialAdInstance | null>(null);

  // Pre-load rewarded ad on mount (only in real native builds)
  useEffect(() => {
    if (IS_EXPO_GO) return;

    let cleanupFns: Array<() => void> = [];

    getAdModule().then((mod) => {
      if (!mod) return;
      const { RewardedAd, AdEventType, RewardedAdEventType } = mod;

      const ad = RewardedAd.createForAdRequest(REWARDED_ID, {
        requestNonPersonalizedAdsOnly: true,
      });
      rewardedRef.current = ad;

      cleanupFns.push(
        ad.addAdEventListener(RewardedAdEventType.LOADED, () => setRewardedAdReady(true))
      );
      cleanupFns.push(
        ad.addAdEventListener(AdEventType.CLOSED, () => {
          setRewardedAdReady(false);
          ad.load();
        })
      );

      ad.load();
    });

    return () => cleanupFns.forEach((fn) => fn());
  }, [setRewardedAdReady]);

  const showInterstitialIfDue = useCallback(async (): Promise<void> => {
    const shouldShow = recordCompletion();
    if (!shouldShow || IS_EXPO_GO) return;

    const mod = await getAdModule();
    if (!mod) return;

    const { InterstitialAd, AdEventType } = mod;
    const ad = InterstitialAd.createForAdRequest(INTERSTITIAL_ID, {
      requestNonPersonalizedAdsOnly: true,
    });
    interstitialRef.current = ad;
    ad.load();

    return new Promise((resolve) => {
      const loadedUnsub = ad.addAdEventListener(AdEventType.LOADED, () => {
        loadedUnsub();
        setInterstitialShowing(true);
        ad.show().catch(resolve);
      });

      const closedUnsub = ad.addAdEventListener(AdEventType.CLOSED, () => {
        closedUnsub();
        setInterstitialShowing(false);
        resolve();
      });

      const errorUnsub = ad.addAdEventListener(AdEventType.ERROR, () => {
        errorUnsub();
        resolve();
      });
    });
  }, [recordCompletion, setInterstitialShowing]);

  const showRewardedAd = useCallback((): Promise<boolean> => {
    // In Expo Go or if ad module unavailable, always grant the hint
    if (IS_EXPO_GO) return Promise.resolve(true);

    return new Promise((resolve) => {
      const ad = rewardedRef.current;
      if (!ad) { resolve(true); return; }

      const { isRewardedAdReady } = useAdsStore.getState();
      if (!isRewardedAdReady) { resolve(true); return; }

      getAdModule().then((mod) => {
        if (!mod) { resolve(true); return; }

        const { AdEventType, RewardedAdEventType } = mod;
        let rewarded = false;

        const earnedUnsub = ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
          rewarded = true;
        });
        const closedUnsub = ad.addAdEventListener(AdEventType.CLOSED, () => {
          earnedUnsub();
          closedUnsub();
          setRewardedAdReady(false);
          ad.load();
          resolve(rewarded || true);
        });
        const errorUnsub = ad.addAdEventListener(AdEventType.ERROR, () => {
          errorUnsub();
          resolve(true);
        });

        ad.show().catch(() => resolve(true));
      });
    });
  }, [setRewardedAdReady]);

  return { showInterstitialIfDue, showRewardedAd };
}