'use client'

import { Children, useRef } from 'react'
import { useReducedMotion } from 'motion/react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useLocale } from '@/components/providers'
import { Reveal } from '@/components/reveal'
import { cn } from '@/lib/utils'

/**
 * Native scroll-snap row. Fractional `itemClassName` widths make the next card
 * peek on mobile (brief §2.2). `py-2` keeps the cards' hover lift from being
 * clipped — overflow-x:auto forces overflow-y to clip too.
 */
export function Carousel({
  title,
  action,
  itemClassName,
  children,
}: {
  title: string
  action?: React.ReactNode
  itemClassName: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLUListElement>(null)
  const reduced = useReducedMotion()
  const { t } = useLocale()

  const scroll = (direction: 1 | -1) => {
    const el = ref.current
    if (!el) return
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: reduced ? 'auto' : 'smooth' })
  }

  const arrow =
    'hidden h-10 w-10 items-center justify-center rounded-full border border-ink/15 text-ink transition-colors hover:bg-surface-alt md:inline-flex'

  return (
    <div>
      <Reveal className="mb-4 flex items-end justify-between gap-4">
        <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ink text-balance md:text-3xl">
          {title}
        </h2>
        <div className="flex shrink-0 items-center gap-2">
          {action}
          <button type="button" onClick={() => scroll(-1)} aria-label={t.landing.prev} className={arrow}>
            <ChevronLeft className="size-5" strokeWidth={1.75} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => scroll(1)} aria-label={t.landing.next} className={arrow}>
            <ChevronRight className="size-5" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      </Reveal>
      <ul
        ref={ref}
        aria-label={title}
        className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 py-2 md:-mx-6 md:scroll-px-6 md:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {Children.map(children, (child) => (
          <li className={cn('shrink-0 snap-start', itemClassName)}>{child}</li>
        ))}
      </ul>
    </div>
  )
}
