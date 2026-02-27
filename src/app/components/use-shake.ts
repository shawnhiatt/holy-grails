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

      // Prefer acceleration (gravity-excluded) for clean threshold comparison.
      // Fall back to accelerationIncludingGravity with gravity compensation.
      const acc = event.acceleration;
      const accWithG = event.accelerationIncludingGravity;

      let magnitude: number;
      let adjustedThreshold: number;

      if (acc && acc.x != null && acc.y != null && acc.z != null) {
        magnitude = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
        adjustedThreshold = threshold;
      } else if (accWithG && accWithG.x != null && accWithG.y != null && accWithG.z != null) {
        magnitude = Math.sqrt(accWithG.x * accWithG.x + accWithG.y * accWithG.y + accWithG.z * accWithG.z);
        adjustedThreshold = threshold + 9.8; // compensate for resting gravity
      } else {
        return;
      }

      if (magnitude > adjustedThreshold) {
        const now = Date.now();
        if (now - lastShakeRef.current > timeout) {
          shakeCountRef.current = 0;
        }
        shakeCountRef.current++;
        lastShakeRef.current = now;

        // Require 3 threshold exceedances within the timeout window
        if (shakeCountRef.current >= 3) {
          shakeCountRef.current = 0;
          cooldownRef.current = true;
          onShakeRef.current();
          // Debounce: prevent rapid re-triggers (matches timeout parameter)
          setTimeout(() => {
            cooldownRef.current = false;
          }, timeout);
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
