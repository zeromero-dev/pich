import { Hero } from '@/components/landing/hero'
import { EventsPreview } from '@/components/landing/events-preview'
import { FeaturedWorks } from '@/components/landing/featured-works'
import { AboutTeaser } from '@/components/landing/about-teaser'

export default function Page() {
  return (
    <main>
      <Hero />
      <EventsPreview />
      <FeaturedWorks />
      <AboutTeaser />
    </main>
  )
}
