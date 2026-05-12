import { create } from 'zustand';

interface MergePayload {
  localCount: number;
  cloudCount: number;
  onKeepLocal: () => void;
  onKeepCloud: () => void;
  onMergeBoth: () => void;
}

interface ProgressMergeStore {
  pending: MergePayload | null;
  showMergeModal: (payload: MergePayload) => void;
  dismissMergeModal: () => void;
}

export const useProgressMergeStore = create<ProgressMergeStore>((set) => ({
  pending: null,
  showMergeModal: (payload) => set({ pending: payload }),
  dismissMergeModal: () => set({ pending: null }),
}));