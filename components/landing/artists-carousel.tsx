'use client'

import Link from 'next/link'
import type { Artist } from '@/lib/data'
import { useLocale } from '@/components/providers'
import { Carousel, CarouselEndCard } from '@/components/carousel'
import { ArtistCard } from '@/components/artists/artists-view'

export function ArtistsCarousel({ artists }: { artists: Artist[] }) {
  const { t } = useLocale()
  return (
    <section className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
      <Carousel
        title={t.landing.artistsTitle}
        itemClassName="w-[42%] sm:w-[30%] lg:w-[calc((100%-4rem)/5)]"
        action={
          <Link href="/artists" className="mr-2 text-sm font-medium text-ink-soft transition-colors hover:text-ink">
            {t.landing.artistsAll}
          </Link>
        }
      >
        {artists.map((artist) => (
          <ArtistCard key={artist.slug} artist={artist} heading="h3" />
        ))}
        <CarouselEndCard href="/artists" label={t.landing.artistsAll} className="bg-surface-alt hover:bg-surface-alt/70" />
      </Carousel>
    </section>
  )
}
