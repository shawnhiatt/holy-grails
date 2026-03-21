import { useRef, useEffect, useCallback } from 'react';

type HapticStyle = 'light' | 'medium' | 'heavy';

/**
 * iOS 18+ haptic feedback via the <input type="checkbox" switch> trick.
 * Falls back to navigator.vibrate() on Android.
 * Does nothing on unsupported platforms.
 */

const VIBRATION_PATTERNS: Record<HapticStyle, number | number[]> = {
  light: 10,
  medium: 30,
  heavy: [50, 20, 50],
};

function isIOS(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function createHapticPair(id: string): { input: HTMLInputElement; label: HTMLLabelElement } {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.id = id;
  input.style.display = 'none';

  const label = document.createElement('label');
  label.htmlFor = id;
  label.style.display = 'none';

  document.body.appendChild(input);
  document.body.appendChild(label);

  return { input, label };
}

export function useHaptic(style: HapticStyle = 'light') {
  const pairRef = useRef<{ input: HTMLInputElement; label: HTMLLabelElement } | null>(null);

  useEffect(() => {
    const id = `haptic-${style}-${Math.random().toString(36).slice(2, 9)}`;
    pairRef.current = createHapticPair(id);

    return () => {
      pairRef.current?.input.remove();
      pairRef.current?.label.remove();
      pairRef.current = null;
    };
  }, [style]);

  const trigger = useCallback(() => {
    if (isIOS()) {
      // iOS 18+: label click fires native haptic via WebKit switch input
      pairRef.current?.label.click();
    } else if ('vibrate' in navigator) {
      // Android fallback via Vibration API
      navigator.vibrate(VIBRATION_PATTERNS[style]);
    }
  }, [style]);

  return trigger;
}
