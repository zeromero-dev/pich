'use client'

import { ChevronDown } from 'lucide-react'
import type { EventBadge, PlaiEvent } from '@/lib/events'
import { useLocale } from '@/components/providers'
import { EventCard } from '@/components/event-card'
import { Reveal, StaggerGroup, StaggerItem } from '@/components/reveal'

const sectionTitle = 'text-2xl font-semibold tracking-[-0.02em] text-ink'

function Cards({ events, badge }: { events: PlaiEvent[]; badge: (e: PlaiEvent) => EventBadge | undefined }) {
  return (
    <StaggerGroup className="flex flex-col gap-4">
      {events.map((event) => (
        <StaggerItem key={event.slug}>
          <EventCard event={event} badge={badge(event)} />
        </StaggerItem>
      ))}
    </StaggerGroup>
  )
}

function EventList({ title, ...cards }: { title: string } & Parameters<typeof Cards>[0]) {
  return (
    <section>
      <Reveal className="mb-5">
        <h2 className={sectionTitle}>{title}</h2>
      </Reveal>
      <Cards {...cards} />
    </section>
  )
}

/* Brief: «Якщо майбутніх немає, показуємо лише минулі, без порожнього блоку».
   Past events sit in a collapsed <details>, opened by default when nothing else is listed. */
export function EventsView({
  current,
  upcoming,
  past,
}: {
  current: PlaiEvent[]
  upcoming: PlaiEvent[]
  past: PlaiEvent[]
}) {
  const { t } = useLocale()
  const nearest = upcoming[0]?.date
  const onlyPast = current.length === 0 && upcoming.length === 0

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
        {current.length > 0 && <EventList title={t.events.current} events={current} badge={() => 'current'} />}
        {upcoming.length > 0 && (
          <EventList
            title={t.events.upcoming}
            events={upcoming}
            badge={(e) => (e.date === nearest ? 'soon' : undefined)}
          />
        )}
        {past.length > 0 && (
          <details open={onlyPast} className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg [&::-webkit-details-marker]:hidden">
              <h2 className={sectionTitle}>{t.events.past}</h2>
              <span className="text-base text-ink-soft">({past.length})</span>
              <ChevronDown
                className="size-5 text-ink-soft transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <div className="mt-5">
              <Cards events={past} badge={() => 'past'} />
            </div>
          </details>
        )}
        {onlyPast && past.length === 0 && (
          <p className="rounded-3xl bg-surface-alt px-6 py-16 text-center text-base text-ink-soft">
            {t.events.empty}
          </p>
        )}
      </div>
    </main>
  )
}
