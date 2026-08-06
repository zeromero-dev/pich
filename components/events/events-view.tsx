'use client'

import { events, type PlaiEvent } from '@/lib/data'
import { monthKey, monthLabel } from '@/lib/format'
import { useLocale } from '@/components/providers'
import { EventCard } from '@/components/event-card'
import { Reveal, StaggerGroup, StaggerItem } from '@/components/reveal'

type MonthGroup = { key: string; label: string; items: PlaiEvent[] }

export function EventsView() {
  const { t, locale } = useLocale()
  const sorted = [...events].sort((a, b) => +new Date(a.start) - +new Date(b.start))

  const groups: MonthGroup[] = []
  for (const event of sorted) {
    const key = monthKey(event.start)
    const last = groups[groups.length - 1]
    if (last?.key === key) last.items.push(event)
    else groups.push({ key, label: monthLabel(event.start, locale), items: [event] })
  }

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

      <div className="flex flex-col gap-12">
        {groups.map((group) => (
          <section key={group.key}>
            <Reveal className="mb-5">
              <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink">{group.label}</h2>
            </Reveal>
            <StaggerGroup className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {group.items.map((event) => (
                <StaggerItem key={event.id} className="h-full">
                  <EventCard event={event} />
                </StaggerItem>
              ))}
            </StaggerGroup>
          </section>
        ))}
      </div>
    </main>
  )
}
