import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { eventBadge, getEvent, getEvents, splitEvents } from '@/lib/events'
import { serializeJsonLd } from '@/lib/json-ld'
import { WEBSITE_URL } from '@/lib/site'
import { EventDetail } from '@/components/events/event-detail'

// Same window as /events. dynamicParams stays true (the default): a row added
// to the sheet after the deploy must still get its page.
export const revalidate = 300

export async function generateStaticParams() {
  return (await getEvents()).map((e) => ({ slug: e.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const event = await getEvent(slug)
  if (!event) return { title: 'Подію не знайдено' }
  return {
    title: event.title,
    description: event.summary,
    openGraph: { title: event.title, images: event.image ? [event.image] : undefined },
  }
}

/** '+02:00' / '+03:00' (summer time) on that day: times are typed in the center's local time, and without an offset Google may read UTC. */
const kyivZone = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Kyiv', timeZoneName: 'longOffset' })
function kyivOffset(date: string): string {
  const parts = kyivZone.formatToParts(new Date(`${date}T12:00:00Z`))
  return parts.find((p) => p.type === 'timeZoneName')?.value.replace('GMT', '') || '+02:00'
}

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const [{ slug }, events] = await Promise.all([params, getEvents()])
  const event = events.find((e) => e.slug === slug)
  if (!event) notFound()

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    startDate: event.time ? `${event.date}T${event.time}${kyivOffset(event.date)}` : event.date,
    endDate: event.endTime ? `${event.date}T${event.endTime}${kyivOffset(event.date)}` : event.endDate,
    description: event.summary,
    image: event.image?.startsWith('/') ? `${WEBSITE_URL}${event.image}` : event.image,
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <EventDetail event={event} badge={eventBadge(event, splitEvents(events).upcoming[0]?.date)} />
    </>
  )
}
