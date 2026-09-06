import type { Metadata } from 'next'
import { serializeJsonLd } from '@/lib/json-ld'
import { events } from '@/lib/data'
import { EventsView } from '@/components/events/events-view'

export const metadata: Metadata = {
  title: 'Події',
  description: 'Виставки, майстер-класи та зустрічі в арт-центрі Плай Піч.',
}

export default function EventsPage() {
  const jsonLd = events.map((e) => ({
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: e.title,
    startDate: e.start,
    description: e.description,
    location: { '@type': 'Place', name: e.location },
  }))

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <EventsView />
    </>
  )
}
