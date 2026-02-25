/**
 * Motion tokens — shared easing curves and durations for all animations.
 * Corresponds to CSS custom properties in theme.css.
 * For use with motion/react's `transition` prop.
 */

// Easing curves (cubic-bezier arrays for motion/react)
export const EASE_OUT: [number, number, number, number] = [0.25, 1, 0.5, 1];
export const EASE_IN_OUT: [number, number, number, number] = [0.76, 0, 0.24, 1];
export const EASE_IN: [number, number, number, number] = [0.5, 0, 0.75, 0];

// Duration values in seconds (motion/react uses seconds)
export const DURATION_MICRO = 0.1;
export const DURATION_FAST = 0.175;
export const DURATION_NORMAL = 0.225;
export const DURATION_SLOW = 0.3;
