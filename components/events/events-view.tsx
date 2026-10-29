'use client'

import type { PlaiEvent } from '@/lib/events'
import { useLocale } from '@/components/providers'
import { EventCard } from '@/components/event-card'
import { Reveal, StaggerGroup, StaggerItem } from '@/components/reveal'

function EventList({ title, events, past }: { title: string; events: PlaiEvent[]; past: boolean }) {
  return (
    <section>
      <Reveal className="mb-5">
        <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ink">{title}</h2>
      </Reveal>
      <StaggerGroup className="flex flex-col gap-4">
        {events.map((event) => (
          <StaggerItem key={event.slug}>
            <EventCard event={event} past={past} />
          </StaggerItem>
        ))}
      </StaggerGroup>
    </section>
  )
}

/* Brief: «Якщо майбутніх немає, показуємо лише минулі, без порожнього блоку». */
export function EventsView({ upcoming, past }: { upcoming: PlaiEvent[]; past: PlaiEvent[] }) {
  const { t } = useLocale()

  return (
    <main className="mx-auto w-full max-w-4xl px-4 pt-10 pb-16 md:px-6 md:pt-14 md:pb-24">
      <Reveal className="mb-10">
        <h1 className="text-[2rem] leading-tight font-semibold tracking-[-0.02em] text-ink text-balance md:text-5xl">
          {t.events.title}
        </h1>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-ink-soft text-pretty">
          {t.events.lead}
        </p>
      </Reveal>

      <div className="flex flex-col gap-14">
        {upcoming.length > 0 && <EventList title={t.events.upcoming} events={upcoming} past={false} />}
        {past.length > 0 && <EventList title={t.events.past} events={past} past />}
        {upcoming.length === 0 && past.length === 0 && (
          <p className="rounded-3xl bg-surface-alt px-6 py-16 text-center text-base text-ink-soft">
            {t.events.empty}
          </p>
        )}
      </div>
    </main>
  )
}
