import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Reveal } from '@/components/reveal'

export function SectionHeading({
  title,
  href,
  linkLabel,
}: {
  title: string
  href?: string
  linkLabel?: string
}) {
  return (
    <Reveal className="mb-8 flex items-end justify-between gap-4">
      <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ink text-balance md:text-3xl">
        {title}
      </h2>
      {href && linkLabel && (
        <Link
          href={href}
          className="group inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
        >
          {linkLabel}
          <ArrowRight
            className="size-4 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </Link>
      )}
    </Reveal>
  )
}
