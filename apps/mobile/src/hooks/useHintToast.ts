import { useRef, useState } from 'react';

/**
 * Lightweight toast helper for hint descriptions.
 * Usage:
 *   const { showHintToast, hintToastMsg } = useHintToast();
 *   showHintToast('Row 3 must be filled here.');
 *   // render: {hintToastMsg && <HintToastView msg={hintToastMsg} />}
 */
export function useHintToast(durationMs = 3000) {
  const [hintToastMsg, setHintToastMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showHintToast(msg: string) {
    if (timer.current) clearTimeout(timer.current);
    setHintToastMsg(msg);
    timer.current = setTimeout(() => setHintToastMsg(null), durationMs);
  }

  return { hintToastMsg, showHintToast };
}