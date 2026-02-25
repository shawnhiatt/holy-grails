import { useEffect, useRef, useCallback } from "react";

interface UseShakeOptions {
  threshold?: number;
  timeout?: number;
  onShake: () => void;
  enabled?: boolean;
}

/**
 * Detects a "shake" gesture on mobile devices via the DeviceMotion API.
 * Calls `onShake` when acceleration exceeds the threshold multiple times within the timeout window.
 */
export function useShake({ threshold = 15, timeout = 1000, onShake, enabled = true }: UseShakeOptions) {
  const lastShakeRef = useRef(0);
  const shakeCountRef = useRef(0);
  const cooldownRef = useRef(false);
  const onShakeRef = useRef(onShake);
  onShakeRef.current = onShake;

  const handleMotion = useCallback(
    (event: DeviceMotionEvent) => {
      if (cooldownRef.current) return;

      const acc = event.accelerationIncludingGravity;
      if (!acc || acc.x == null || acc.y == null || acc.z == null) return;

      const magnitude = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);

      // Subtract gravity (~9.8) and check against threshold
      if (magnitude > threshold + 9.8) {
        const now = Date.now();
        if (now - lastShakeRef.current > timeout) {
          shakeCountRef.current = 0;
        }
        shakeCountRef.current++;
        lastShakeRef.current = now;

        // Require 3 shakes within the timeout window
        if (shakeCountRef.current >= 3) {
          shakeCountRef.current = 0;
          cooldownRef.current = true;
          onShakeRef.current();
          // Cooldown to prevent rapid re-triggers
          setTimeout(() => {
            cooldownRef.current = false;
          }, 1500);
        }
      }
    },
    [threshold, timeout]
  );

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    if (!("DeviceMotionEvent" in window)) return;

    // iOS 13+ requires permission
    const requestPermission = async () => {
      const DME = DeviceMotionEvent as any;
      if (typeof DME.requestPermission === "function") {
        try {
          const permission = await DME.requestPermission();
          if (permission === "granted") {
            window.addEventListener("devicemotion", handleMotion);
          }
        } catch {
          // Permission denied — silently ignore
        }
      } else {
        // Non-iOS or older iOS — just listen
        window.addEventListener("devicemotion", handleMotion);
      }
    };

    requestPermission();

    return () => {
      window.removeEventListener("devicemotion", handleMotion);
    };
  }, [enabled, handleMotion]);
}
