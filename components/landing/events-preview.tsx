'use client'

import { events } from '@/lib/data'
import { useLocale } from '@/components/providers'
import { EventCard } from '@/components/event-card'
import { SectionHeading } from '@/components/section-heading'
import { StaggerGroup, StaggerItem } from '@/components/reveal'

export function EventsPreview() {
  const { t } = useLocale()
  const upcoming = events.slice(0, 3)

  return (
    <section className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
      <SectionHeading title={t.landing.eventsTitle} href="/events" linkLabel={t.landing.eventsAll} />
      <StaggerGroup className="grid gap-4 md:grid-cols-3">
        {upcoming.map((event) => (
          <StaggerItem key={event.id}>
            <EventCard event={event} />
          </StaggerItem>
        ))}
      </StaggerGroup>
    </section>
  )
}
