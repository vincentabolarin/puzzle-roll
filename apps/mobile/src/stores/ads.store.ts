import { create } from 'zustand';

interface AdsState {
  completionsSinceLastAd: number;
  isRewardedAdLoading: boolean;
  isRewardedAdReady: boolean;
  isInterstitialShowing: boolean;
}

interface AdsActions {
  recordCompletion: () => boolean; // returns true if interstitial should show
  setRewardedAdReady: (ready: boolean) => void;
  setRewardedAdLoading: (loading: boolean) => void;
  setInterstitialShowing: (showing: boolean) => void;
  resetCompletionCount: () => void;
}

const INTERSTITIAL_FREQUENCY = 3;

export const useAdsStore = create<AdsState & AdsActions>((set, get) => ({
  completionsSinceLastAd: 0,
  isRewardedAdLoading: false,
  isRewardedAdReady: false,
  isInterstitialShowing: false,

  recordCompletion: () => {
    const next = get().completionsSinceLastAd + 1;
    const shouldShow = next >= INTERSTITIAL_FREQUENCY;
    set({ completionsSinceLastAd: shouldShow ? 0 : next });
    return shouldShow;
  },

  setRewardedAdReady: (ready) => set({ isRewardedAdReady: ready }),
  setRewardedAdLoading: (loading) => set({ isRewardedAdLoading: loading }),
  setInterstitialShowing: (showing) => set({ isInterstitialShowing: showing }),
  resetCompletionCount: () => set({ completionsSinceLastAd: 0 }),
}));
