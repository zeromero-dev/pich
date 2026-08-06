'use client'

import { motion, useReducedMotion, type HTMLMotionProps } from 'motion/react'
import { ease } from '@/lib/motion'
import { cn } from '@/lib/utils'

type RevealProps = HTMLMotionProps<'div'> & {
  /** delay in seconds */
  delay?: number
  as?: 'div' | 'section' | 'li' | 'article' | 'header'
}

/** Content block entrance: fade in + rise 12px, once on scroll into view. */
export function Reveal({ className, delay = 0, children, ...props }: RevealProps) {
  const reduced = useReducedMotion()
  return (
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
      whileInView={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
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
      viewport={{ once: true, amount: 0.15 }}
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
