import { artistsOf, getCatalog, rootCategoriesOf } from '@/lib/hugeprofit'
import { withProfiles } from '@/lib/artists'
import { serializeJsonLd } from '@/lib/json-ld'
import { BRAND, WEBSITE_URL } from '@/lib/site'
import { Hero } from '@/components/landing/hero'
import { CategoriesCarousel } from '@/components/landing/categories-carousel'
import { NewArrivals } from '@/components/landing/new-arrivals'
import { EventsTeaser } from '@/components/landing/events-teaser'
import { ArtistsCarousel } from '@/components/landing/artists-carousel'

// Organization goes on the homepage only — Google reads it there, and repeating
// it site-wide would collide with the per-page Event/Product schemas.
// No sameAs: the footer's social links are placeholders — invented
// machine-readable business data is worse than none. Address and hours mirror
// the footer (lib/i18n.ts, footer.street / footer.hoursValue).
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: BRAND.name,
  url: WEBSITE_URL,
  logo: BRAND.logo,
  description: BRAND.tagline,
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'вул. Григорія Сковороди, 25',
    addressLocality: 'Вінниця',
    addressCountry: 'UA',
  },
  openingHours: 'Mo-Su 11:00-21:00',
}

export default async function Page() {
  const products = await getCatalog()
  // Catalog order is CRM order, newest first, with in-stock works first.
  const arrivals = products.filter((p) => p.inStock).slice(0, 12)
  const artists = artistsOf(products).slice(0, 16).map(withProfiles)

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <main>
        <Hero />
        <CategoriesCarousel categories={rootCategoriesOf(products)} />
        <NewArrivals products={arrivals} />
        <EventsTeaser />
        <ArtistsCarousel artists={artists} />
      </main>
    </>
  )
}
