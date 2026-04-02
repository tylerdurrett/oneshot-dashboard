// Shared Motion animation presets for treemap tile transitions.

import type { CSSProperties } from 'react';

import { TILE_BORDER_RADIUS } from './timer-types';

export const REFLOW_SPRING = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 30,
};

export const REFLOW_TRANSITION = {
  left: REFLOW_SPRING,
  top: REFLOW_SPRING,
  width: REFLOW_SPRING,
  height: REFLOW_SPRING,
};

// Micro-expand (1.03) then shrink to 0, opacity fades in the back half,
// border-radius increases to create a "square → circle" pop effect.
export const BUBBLE_POP_EXIT = {
  scale: [1, 1.03, 0],
  opacity: [1, 1, 0],
  borderRadius: [`${TILE_BORDER_RADIUS}px`, `${TILE_BORDER_RADIUS}px`, '50%'],
  filter: ['blur(0px)', 'blur(0px)', 'blur(4px)'],
};

const BUBBLE_POP_TRANSITION = {
  duration: 0.3,
  times: [0, 0.15, 1],
  ease: 'easeInOut' as const,
};

export const TILE_TRANSITION = {
  ...REFLOW_TRANSITION,
  scale: BUBBLE_POP_TRANSITION,
  opacity: BUBBLE_POP_TRANSITION,
  borderRadius: BUBBLE_POP_TRANSITION,
  filter: BUBBLE_POP_TRANSITION,
};

/** Static style for the motion.div tile wrapper (absolute positioning + clipping). */
export const TILE_WRAPPER_STYLE: CSSProperties = {
  position: 'absolute',
  overflow: 'hidden',
  borderRadius: TILE_BORDER_RADIUS,
};

/** Static style for the inner TimerBucket to fill its motion.div wrapper. */
export const TILE_INNER_STYLE: CSSProperties = {
  width: '100%',
  height: '100%',
};
