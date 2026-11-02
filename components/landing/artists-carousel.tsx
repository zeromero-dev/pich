'use client'

import { ArrowRight } from 'lucide-react'
import type { Artist } from '@/lib/data'
import { useLocale } from '@/components/providers'
import { Carousel } from '@/components/carousel'
import { PillLink } from '@/components/pill-button'
import { ArtistCard } from '@/components/artists/artists-view'

export function ArtistsCarousel({ artists }: { artists: Artist[] }) {
  const { t } = useLocale()
  return (
    <section className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
      <Carousel
        title={t.landing.artistsTitle}
        itemClassName="w-[42%] sm:w-[30%] lg:w-[calc((100%-4rem)/5)]"
      >
        {artists.map((artist) => (
          <ArtistCard key={artist.slug} artist={artist} heading="h3" />
        ))}
      </Carousel>
      <div className="mt-8 flex justify-center">
        <PillLink href="/artists" variant="secondary">
          {t.landing.artistsAll}
          <ArrowRight className="size-4" aria-hidden="true" />
        </PillLink>
      </div>
    </section>
  )
}
