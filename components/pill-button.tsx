'use client'

import Link from 'next/link'
import { m } from 'motion/react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { spring } from '@/lib/motion'

const pill = cva(
  'inline-flex items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap transition-colors select-none disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-ink text-surface hover:bg-[#2a2a2a]',
        secondary: 'border border-ink/15 text-ink hover:bg-surface-alt',
        ghost: 'text-ink-soft hover:text-ink hover:bg-surface-alt',
      },
      size: {
        default: 'h-11 px-6 text-sm',
        hero: 'h-[3.25rem] px-8 text-base',
        sm: 'h-9 px-4 text-sm',
      },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  },
)

type Variants = VariantProps<typeof pill>

const MotionButton = m.button
const MotionLink = m.create(Link)

export function PillButton({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof MotionButton> & Variants) {
  return (
    <MotionButton
      whileTap={{ scale: 0.97 }}
      transition={spring.snap}
      className={cn(pill({ variant, size }), className)}
      {...props}
    />
  )
}

export function PillLink({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof MotionLink> & Variants) {
  return (
    <MotionLink
      whileTap={{ scale: 0.97 }}
      transition={spring.snap}
      className={cn(pill({ variant, size }), className)}
      {...props}
    />
  )
}
