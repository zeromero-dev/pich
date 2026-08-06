'use client'

import { events } from '@/lib/data'
import { useLocale } from '@/components/providers'
import { EventCard } from '@/components/event-card'
import { Reveal, StaggerGroup, StaggerItem } from '@/components/reveal'

export function EventsView() {
  const { t } = useLocale()
  const sorted = [...events].sort((a, b) => +new Date(a.start) - +new Date(b.start))

  return (
    <main className="mx-auto max-w-6xl px-4 pt-10 pb-16 md:px-6 md:pt-14 md:pb-24">
      <Reveal className="mb-10">
        <h1 className="text-[2rem] leading-tight font-semibold tracking-[-0.02em] text-ink text-balance md:text-5xl">
          {t.events.title}
        </h1>
        <p className="mt-3 max-w-md text-base leading-relaxed text-ink-soft text-pretty">
          {t.events.lead}
        </p>
      </Reveal>

      <StaggerGroup className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {sorted.map((event) => (
          <StaggerItem key={event.id}>
            <EventCard event={event} />
          </StaggerItem>
        ))}
      </StaggerGroup>
    </main>
  )
}
