import { getCatalog } from '@/lib/hugeprofit'
import { BRAND, WEBSITE_URL } from '@/lib/site'
import { Hero } from '@/components/landing/hero'
import { EventsPreview } from '@/components/landing/events-preview'
import { FeaturedWorks } from '@/components/landing/featured-works'
import { AboutTeaser } from '@/components/landing/about-teaser'

// Organization goes on the homepage only — Google reads it there, and repeating
// it site-wide would collide with the per-page Event/Product schemas.
// No address/openingHours/sameAs: the footer's are placeholders, and publishing
// invented ones as machine-readable business data is worse than omitting them.
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: BRAND.name,
  url: WEBSITE_URL,
  logo: BRAND.logo,
  description: BRAND.tagline,
}

export default async function Page() {
  const products = await getCatalog()
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main>
        <Hero />
        <EventsPreview />
        <FeaturedWorks products={products} />
        <AboutTeaser />
      </main>
    </>
  )
}
