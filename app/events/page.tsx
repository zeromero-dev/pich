import type { Metadata } from 'next'
import { getEvents, splitEvents } from '@/lib/events'
import { EventsView } from '@/components/events/events-view'

export const metadata: Metadata = {
  title: 'Події',
  description: 'Ярмарки, виставки та зустрічі з авторами мистецької крамнички ПІЧ.',
}

// Current/upcoming/past is decided at render time, so a short regeneration window
// moves events between sections and picks up new sheet rows.
export const revalidate = 300

export default async function EventsPage() {
  return <EventsView {...splitEvents(await getEvents())} />
}
