'use client'

import Link from 'next/link'
import { useLocale } from '@/components/providers'
import { Reveal, StaggerGroup, StaggerItem } from '@/components/reveal'
import type { Artist } from '@/lib/data'

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
}

function Portrait({ artist }: { artist: Artist }) {
  const image = artist.portrait ?? artist.cover
  if (image) {
    return (
      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-surface-alt">
        <img
          src={image}
          alt=""
          loading="lazy"
          className={
            artist.portrait
              ? 'absolute inset-0 h-full w-full object-cover'
              : 'absolute inset-0 h-full w-full object-contain p-3'
          }
        />
      </div>
    )
  }
  return (
    <div
      aria-hidden="true"
      className="flex aspect-[4/5] items-center justify-center rounded-2xl bg-surface-alt"
    >
      <span className="text-4xl font-semibold tracking-[-0.02em] text-ink-faint">
        {initials(artist.name)}
      </span>
    </div>
  )
}

export function ArtistsView({ artists }: { artists: Artist[] }) {
  const { t } = useLocale()

  return (
    <main className="mx-auto max-w-6xl px-4 pt-10 pb-16 md:px-6 md:pt-14 md:pb-24">
      <Reveal className="mb-10">
        <h1 className="text-[2rem] leading-tight font-semibold tracking-[-0.02em] text-ink md:text-5xl">
          {t.about.artistsTitle}
        </h1>
        <p className="mt-3 max-w-md text-base leading-relaxed text-ink-soft text-pretty">
          {t.about.artistsLead}
        </p>
      </Reveal>

      <StaggerGroup className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">
        {artists.map((artist) => (
          <StaggerItem key={artist.slug}>
            <Link href={`/artists/${artist.slug}`} className="group block">
              <Portrait artist={artist} />
              <h2 className="mt-3 text-base font-semibold leading-snug text-ink text-pretty transition-colors group-hover:text-ink-soft">
                {artist.name}
              </h2>
              <p className="mt-0.5 text-sm text-ink-faint tabular-nums">
                {t.about.worksCount(artist.workCount)}
              </p>
            </Link>
          </StaggerItem>
        ))}
      </StaggerGroup>
    </main>
  )
}
