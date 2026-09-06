'use client'

import { motion, useReducedMotion, type HTMLMotionProps } from 'motion/react'
import { ease } from '@/lib/motion'
import { cn } from '@/lib/utils'

type RevealProps = HTMLMotionProps<'div'> & {
  /** delay in seconds */
  delay?: number
  as?: 'div' | 'section' | 'li' | 'article' | 'header'
}

/**
 * Scroll-entrance trigger: fires once the block's leading edge is 80px inside
 * the viewport. A fractional `amount` can never be met by a block taller than
 * viewport/amount (the 53-card artist grid on a phone), which left the page
 * blank until a scroll.
 */
const viewport = { once: true, margin: '0px 0px -80px 0px' }

/** Content block entrance: fade in + rise 12px, once on scroll into view. */
export function Reveal({ className, delay = 0, children, ...props }: RevealProps) {
  const reduced = useReducedMotion()
  return (
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
      whileInView={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
      viewport={viewport}
      transition={{ ...ease.page, delay }}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.div>
  )
}

/** Container that staggers its Reveal-like children in a 50ms wave. */
export function StaggerGroup({
  className,
  children,
  ...props
}: HTMLMotionProps<'div'>) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={viewport}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.05 } },
      }}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.div>
  )
}

/** A single staggered item, driven by StaggerGroup's variants. */
export function StaggerItem({
  className,
  children,
  ...props
}: HTMLMotionProps<'div'>) {
  const reduced = useReducedMotion()
  return (
    <motion.div
      variants={{
        hidden: reduced ? { opacity: 0 } : { opacity: 0, y: 12 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] },
        },
      }}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.div>
  )
}
