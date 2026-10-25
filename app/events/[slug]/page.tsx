import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getEvent, getEvents, isPast } from '@/lib/events'
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

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const event = await getEvent(slug)
  if (!event) notFound()

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    startDate: event.date,
    endDate: event.endDate,
    description: event.summary,
    image: event.image?.startsWith('/') ? `${WEBSITE_URL}${event.image}` : event.image,
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <EventDetail event={event} past={isPast(event)} />
    </>
  )
}
