'use client'

import Link from 'next/link'
import { CalendarDays } from 'lucide-react'
import { formatEventDate } from '@/lib/format'
import { useLocale } from '@/components/providers'
import { cn } from '@/lib/utils'
import type { PlaiEvent } from '@/lib/events'

export function EventStatus({ past }: { past: boolean }) {
  const { t } = useLocale()
  return (
    <span
      className={cn(
        'inline-flex self-start rounded-full px-2.5 py-1 text-[11px] font-medium',
        past ? 'bg-surface-alt text-ink-soft' : 'bg-ink text-surface',
      )}
    >
      {past ? t.events.statusPast : t.events.statusUpcoming}
    </span>
  )
}

/* The title link stretches over the whole card (::after): one Tab stop per event. */
export function EventCard({ event, past }: { event: PlaiEvent; past: boolean }) {
  const { t, locale } = useLocale()

  return (
    <article className="relative grid gap-5 rounded-2xl border border-hairline bg-surface p-4 transition-shadow focus-within:ring-2 focus-within:ring-ink hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:p-5">
      {event.image && (
        <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-surface-alt">
          <img
            src={event.image}
            alt=""
            loading="lazy"
            className={cn('absolute inset-0 h-full w-full object-cover', past && 'grayscale')}
          />
        </div>
      )}
      <div className={cn('flex min-w-0 flex-col', !event.image && 'sm:col-span-2')}>
        <EventStatus past={past} />
        <h3 className="mt-3 text-lg font-semibold leading-snug text-ink text-pretty md:text-xl">
          <Link
            href={`/events/${event.slug}`}
            className="outline-none after:absolute after:inset-0 after:rounded-2xl"
          >
            {event.title}
          </Link>
        </h3>
        <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-ink-soft">
          <CalendarDays className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          {formatEventDate(event, locale)}
        </p>
        <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-ink-soft text-pretty">
          {event.summary}
        </p>
        <span aria-hidden="true" className="mt-auto pt-4 text-sm font-medium text-ink">
          {t.events.more} →
        </span>
      </div>
    </article>
  )
}
