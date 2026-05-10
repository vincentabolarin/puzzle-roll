import { useRef, useState, useEffect } from 'react';
import { useSharedValue, withRepeat, withSequence, withTiming, cancelAnimation } from 'react-native-reanimated';

export interface HintHighlight {
  row: number;
  col: number;
  description: string;
  extra?: string;
}

export function useHintHighlight() {
  const [hint, setHint] = useState<HintHighlight | null>(null);
  const blinkAnim = useSharedValue(0);
  const hintRef = useRef<HintHighlight | null>(null);

  useEffect(() => {
    if (hint) {
      blinkAnim.value = 0;
      blinkAnim.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 400 }),
          withTiming(0, { duration: 400 }),
        ),
        -1, // infinite
        false,
      );
    } else {
      cancelAnimation(blinkAnim);
      blinkAnim.value = 0;
    }
  }, [hint?.row, hint?.col]);

  function showHint(h: HintHighlight) {
    hintRef.current = h;
    setHint(h);
  }

  function dismissHint() {
    hintRef.current = null;
    setHint(null);
  }

  function isHinted(row: number, col: number, extra?: string): boolean {
    const h = hintRef.current;
    if (!h) return false;
    if (h.row !== row || h.col !== col) return false;
    if (extra !== undefined && h.extra !== extra) return false;
    return true;
  }

  return { hint, blinkAnim, showHint, dismissHint, isHinted };
}