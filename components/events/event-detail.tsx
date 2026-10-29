'use client'

import Link from 'next/link'
import { ArrowLeft, CalendarDays } from 'lucide-react'
import { formatEventDate } from '@/lib/format'
import { useLocale } from '@/components/providers'
import { EventStatus } from '@/components/event-card'
import { Reveal } from '@/components/reveal'
import type { EventBadge, PlaiEvent } from '@/lib/events'

export function EventDetail({ event, badge }: { event: PlaiEvent; badge?: EventBadge }) {
  const { t, locale } = useLocale()

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-6 pb-16 md:px-6 md:pt-10 md:pb-24">
      <Link
        href="/events"
        className="group inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
        {t.events.back}
      </Link>

      <Reveal className="mt-6 flex flex-col">
        <EventStatus badge={badge} />
        <h1 className="mt-3 first:mt-0 text-[2rem] leading-tight font-semibold tracking-[-0.02em] text-ink text-balance md:text-5xl">
          {event.title}
        </h1>
        <p className="mt-4 inline-flex items-center gap-2 text-base text-ink-soft">
          <CalendarDays className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          {formatEventDate(event, locale)}
        </p>
      </Reveal>

      {event.image && (
        <Reveal className="relative mt-8 aspect-[4/3] overflow-hidden rounded-3xl bg-surface-alt">
          <img src={event.image} alt="" fetchPriority="high" className="absolute inset-0 h-full w-full object-cover" />
        </Reveal>
      )}

      <Reveal className="mt-8">
        <p className="text-lg leading-relaxed whitespace-pre-line text-ink text-pretty">{event.summary}</p>
      </Reveal>
    </main>
  )
}
