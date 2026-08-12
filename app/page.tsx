import { getCatalog } from '@/lib/hugeprofit'
import { Hero } from '@/components/landing/hero'
import { EventsPreview } from '@/components/landing/events-preview'
import { FeaturedWorks } from '@/components/landing/featured-works'
import { AboutTeaser } from '@/components/landing/about-teaser'

export default async function Page() {
  const products = await getCatalog()
  return (
    <main>
      <Hero />
      <EventsPreview />
      <FeaturedWorks products={products} />
      <AboutTeaser />
    </main>
  )
}
