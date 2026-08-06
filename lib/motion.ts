import type { Transition, Variants } from 'motion/react'

/**
 * Motion tokens (§4). Tactile and instant — Nintendo Switch, not luxury slow-fade.
 * Animate transform and opacity only. Never width/height/top.
 */
export const spring = {
  snap: { type: 'spring', stiffness: 500, damping: 30 } as Transition,
  settle: { type: 'spring', stiffness: 300, damping: 28 } as Transition,
} as const

export const ease = {
  fade: { duration: 0.2, ease: 'easeOut' } as Transition,
  page: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } as Transition,
}

/** Press feedback for every clickable element. */
export const pressProps = {
  whileTap: { scale: 0.97 },
  transition: spring.snap,
}

/** Content block entrance: fade in + rise 12px. */
export const entrance: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
}

/** Grid/list container that staggers children by 50ms — a wave, not popcorn. */
export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.05 },
  },
}
