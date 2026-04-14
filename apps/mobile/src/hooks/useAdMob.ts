import { useEffect, useCallback } from 'react';
import {
  InterstitialAd,
  RewardedAd,
  AdEventType,
  RewardedAdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';
import { useAdsStore } from '../stores/ads.store';

const IS_DEV = process.env.NODE_ENV !== 'production';

const INTERSTITIAL_ID = IS_DEV
  ? TestIds.INTERSTITIAL
  : (process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ID ?? TestIds.INTERSTITIAL);

const REWARDED_ID = IS_DEV
  ? TestIds.REWARDED
  : (process.env.EXPO_PUBLIC_ADMOB_REWARDED_ID ?? TestIds.REWARDED);

// Singleton ad instances — loaded outside component lifecycle
let interstitial: InterstitialAd | null = null;
let rewarded: RewardedAd | null = null;

function getInterstitial(): InterstitialAd {
  if (!interstitial) {
    interstitial = InterstitialAd.createForAdRequest(INTERSTITIAL_ID, {
      requestNonPersonalizedAdsOnly: true,
    });
  }
  return interstitial;
}

function getRewarded(): RewardedAd {
  if (!rewarded) {
    rewarded = RewardedAd.createForAdRequest(REWARDED_ID, {
      requestNonPersonalizedAdsOnly: true,
    });
  }
  return rewarded;
}

export function useAdMob() {
  const { setRewardedAdReady, setInterstitialShowing, recordCompletion } = useAdsStore();

  // Pre-load rewarded ad on mount
  useEffect(() => {
    const ad = getRewarded();

    const loadedListener = ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
      setRewardedAdReady(true);
    });

    const closedListener = ad.addAdEventListener(AdEventType.CLOSED, () => {
      setRewardedAdReady(false);
      // Reload for next use
      ad.load();
    });

    ad.load();

    return () => {
      loadedListener();
      closedListener();
    };
  }, [setRewardedAdReady]);

  const showInterstitialIfDue = useCallback(async (): Promise<void> => {
    const shouldShow = recordCompletion();
    if (!shouldShow) return;

    const ad = getInterstitial();
    ad.load();

    return new Promise((resolve) => {
      const loadedListener = ad.addAdEventListener(AdEventType.LOADED, () => {
        loadedListener();
        setInterstitialShowing(true);
        ad.show().catch(() => {
          setInterstitialShowing(false);
          resolve();
        });
      });

      const closedListener = ad.addAdEventListener(AdEventType.CLOSED, () => {
        closedListener();
        setInterstitialShowing(false);
        resolve();
      });

      const errorListener = ad.addAdEventListener(AdEventType.ERROR, () => {
        errorListener();
        resolve(); // silently fail
      });
    });
  }, [recordCompletion, setInterstitialShowing]);

  const showRewardedAd = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      const ad = getRewarded();
      const { isRewardedAdReady } = useAdsStore.getState();

      if (!isRewardedAdReady) {
        // Grant hint anyway on ad failure
        resolve(true);
        return;
      }

      let rewarded = false;

      const earnedListener = ad.addAdEventListener(
        RewardedAdEventType.EARNED_REWARD,
        () => { rewarded = true; }
      );

      const closedListener = ad.addAdEventListener(AdEventType.CLOSED, () => {
        earnedListener();
        closedListener();
        setRewardedAdReady(false);
        ad.load();
        resolve(rewarded || true); // grant hint even if ad closed without earning
      });

      const errorListener = ad.addAdEventListener(AdEventType.ERROR, () => {
        errorListener();
        resolve(true); // grant hint on error
      });

      ad.show().catch(() => resolve(true));
    });
  }, [setRewardedAdReady]);

  return { showInterstitialIfDue, showRewardedAd };
}
