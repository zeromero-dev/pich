'use client'

import Image from 'next/image'
import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { artists, productsByArtist } from '@/lib/data'
import { useLocale } from '@/components/providers'
import { ProductCard } from '@/components/product-card'
import { Reveal, StaggerGroup, StaggerItem } from '@/components/reveal'
import type { Artist } from '@/lib/data'

function Portrait({ artist }: { artist: Artist }) {
  if (artist.portrait) {
    return (
      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-surface-alt">
        <Image
          src={artist.portrait}
          alt={artist.name}
          fill
          sizes="(max-width: 768px) 100vw, 280px"
          className="object-cover"
        />
      </div>
    )
  }
  const initials = artist.name
    .split(' ')
    .map((w) => w[0])
    .join('')
  return (
    <div
      aria-hidden="true"
      className="flex aspect-[4/5] items-center justify-center rounded-2xl bg-surface-alt"
    >
      <span className="text-5xl font-semibold tracking-[-0.02em] text-ink-faint">{initials}</span>
    </div>
  )
}

export function ArtistsView() {
  const { t } = useLocale()

  return (
    <main className="mx-auto max-w-6xl px-4 pt-10 pb-16 md:px-6 md:pt-14 md:pb-24">
      <Reveal className="mb-12">
        <h1 className="text-[2rem] leading-tight font-semibold tracking-[-0.02em] text-ink md:text-5xl">
          {t.about.artistsTitle}
        </h1>
        <p className="mt-3 max-w-md text-base leading-relaxed text-ink-soft text-pretty">
          {t.about.artistsLead}
        </p>
      </Reveal>

      <div className="flex flex-col gap-16 md:gap-24">
        {artists.map((artist) => {
          const works = productsByArtist(artist.name).slice(0, 3)
          return (
            <section key={artist.id} className="grid gap-8 md:grid-cols-[280px_1fr] md:gap-12">
              <Reveal>
                <Portrait artist={artist} />
              </Reveal>
              <div>
                <Reveal>
                  <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ink md:text-3xl">
                    {artist.name}
                  </h2>
                  <p className="mt-3 max-w-prose text-base leading-relaxed text-ink-soft text-pretty">
                    {artist.bio}
                  </p>
                </Reveal>
                {works.length > 0 && (
                  <>
                    <Reveal className="mt-8 flex items-center justify-between gap-4">
                      <h3 className="text-sm font-semibold text-ink">{t.about.selectedWorks}</h3>
                      <Link
                        href="/shop"
                        className="group inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
                      >
                        {t.about.viewInShop}
                        <ArrowRight
                          className="size-4 transition-transform group-hover:translate-x-0.5"
                          aria-hidden="true"
                        />
                      </Link>
                    </Reveal>
                    <StaggerGroup className="mt-4 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3">
                      {works.map((product) => (
                        <StaggerItem key={product.id}>
                          <ProductCard product={product} />
                        </StaggerItem>
                      ))}
                    </StaggerGroup>
                  </>
                )}
              </div>
            </section>
          )
        })}
      </div>
    </main>
  )
}
