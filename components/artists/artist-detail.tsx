'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { useLocale } from '@/components/providers'
import { ProductCard } from '@/components/product-card'
import { Reveal, StaggerGroup, StaggerItem } from '@/components/reveal'
import type { Artist, Product } from '@/lib/data'

export function ArtistDetail({ artist, works }: { artist: Artist; works: Product[] }) {
  const { t } = useLocale()

  return (
    <main className="mx-auto max-w-6xl px-4 pt-6 pb-16 md:px-6 md:pt-10 md:pb-24">
      <Link
        href="/artists"
        className="group inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
      >
        <ArrowLeft
          className="size-4 transition-transform group-hover:-translate-x-0.5"
          aria-hidden="true"
        />
        {t.about.backToArtists}
      </Link>

      <Reveal className="mt-6 mb-10 max-w-[65ch]">
        <h1 className="text-[2rem] leading-tight font-semibold tracking-[-0.02em] text-ink md:text-5xl">
          {artist.name}
        </h1>
        <p className="mt-2 text-sm text-ink-faint tabular-nums">
          {t.about.worksCount(artist.workCount)}
        </p>
        {/* Bios are repo content and most artists have none yet — see artists.md. */}
        {artist.bio && (
          <p className="mt-4 text-base leading-relaxed text-ink-soft text-pretty">
            {artist.bio}
          </p>
        )}
      </Reveal>

      <h2 className="mb-4 text-sm font-semibold text-ink">{t.about.artistWorks}</h2>
      <StaggerGroup className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
        {works.map((product) => (
          <StaggerItem key={product.id}>
            <ProductCard product={product} />
          </StaggerItem>
        ))}
      </StaggerGroup>
    </main>
  )
}
