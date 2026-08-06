'use client'

import { motion, useReducedMotion } from 'motion/react'
import { MapPin, Clock } from 'lucide-react'
import { spring } from '@/lib/motion'
import { eventDateParts, formatEventDateTime } from '@/lib/format'
import { useLocale } from '@/components/providers'
import { PillButton } from '@/components/pill-button'
import type { PlaiEvent } from '@/lib/data'

/** Build a Google Calendar "add event" link from a PlaiEvent. */
function googleCalendarUrl(event: PlaiEvent): string {
  const start = new Date(event.start)
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000)
  const fmt = (d: Date) => d.toISOString().replace(/[-:]|\.\d{3}/g, '')
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: event.description,
    location: event.location,
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

export function EventCard({ event }: { event: PlaiEvent }) {
  const { t, locale } = useLocale()
  const reduced = useReducedMotion()
  const { day, month } = eventDateParts(event.start, locale)

  return (
    <motion.article
      whileHover={reduced ? undefined : { y: -4, boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}
      transition={spring.settle}
      className="flex gap-5 rounded-2xl border border-hairline bg-surface p-5"
    >
      <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-xl bg-surface-alt">
        <span className="text-2xl font-semibold leading-none text-ink tabular-nums">{day}</span>
        <span className="mt-1 text-[11px] font-medium tracking-wide text-ink-soft">{month}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="text-base font-semibold leading-snug text-ink text-pretty">
          {event.title}
        </h3>
        <div className="mt-2 flex flex-col gap-1 text-sm text-ink-soft">
          <span className="inline-flex items-center gap-1.5">
            <Clock className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            {formatEventDateTime(event.start, locale)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            {event.location}
          </span>
        </div>
        <div className="mt-4">
          <PillButton
            variant="secondary"
            size="sm"
            onClick={() => window.open(googleCalendarUrl(event), '_blank', 'noopener')}
          >
            {t.events.register}
          </PillButton>
        </div>
      </div>
    </motion.article>
  )
}
