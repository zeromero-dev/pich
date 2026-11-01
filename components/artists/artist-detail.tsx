'use client'

import Link from 'next/link'
import { ArrowLeft, ArrowUpRight, Globe } from 'lucide-react'
import { InstagramIcon } from '@/components/footer'
import { PillLink } from '@/components/pill-button'
import { useLocale } from '@/components/providers'
import { ProductCard } from '@/components/product-card'
import { Reveal, StaggerGroup, StaggerItem } from '@/components/reveal'
import type { Artist, Product } from '@/lib/data'

const host = (url: string) => new URL(url).hostname.replace(/^www\./, '')

/** "@handle" from an Instagram profile URL; plain "Instagram" if the URL isn't a profile. */
function instagramLabel(url: string): string {
  const handle = new URL(url).pathname.split('/').filter(Boolean)[0]
  return handle && /^[\w.]+$/.test(handle) ? `@${handle}` : 'Instagram'
}

/** The artist's categories: each work's most specific one (the CRM lists leaf first), most works first. */
function categoriesOf(works: Product[]): { slug: string; label: string }[] {
  const counts = new Map<string, { slug: string; label: string; count: number }>()
  for (const work of works) {
    const leaf = work.categories[0]
    if (!leaf) continue
    const entry = counts.get(leaf.slug)
    if (entry) entry.count += 1
    else counts.set(leaf.slug, { ...leaf, count: 1 })
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'uk'))
}

export function ArtistDetail({ artist, works }: { artist: Artist; works: Product[] }) {
  const { t } = useLocale()

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pt-6 pb-16 md:px-6 md:pt-10 md:pb-24">
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

      <Reveal
        className={
          artist.portrait
            ? 'mt-6 mb-12 grid items-start gap-8 md:grid-cols-2 md:gap-12'
            : 'mt-6 mb-10 max-w-[65ch]'
        }
      >
        {artist.portrait && (
          <div className="relative aspect-square overflow-hidden rounded-3xl bg-surface-alt">
            <img
              src={artist.portrait}
              alt={artist.name}
              fetchPriority="high"
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>
        )}
        <div className="max-w-[65ch] md:pt-2">
          <h1 className="text-[2rem] leading-tight font-semibold tracking-[-0.02em] text-ink md:text-5xl">
            {artist.name}
          </h1>
          {artist.workCount > 0 && (
            <p className="mt-2 text-sm text-ink-faint tabular-nums">
              {t.about.worksCount(artist.workCount)}
              {categoriesOf(works).map((category) => (
                <span key={category.slug}>
                  {' · '}
                  <Link
                    href={`/shop?category=${category.slug}`}
                    className="underline decoration-ink/20 underline-offset-4 transition-colors hover:text-ink hover:decoration-ink"
                  >
                    {category.label}
                  </Link>
                </span>
              ))}
            </p>
          )}
          {artist.bio && (
            <p className="mt-6 text-base leading-relaxed whitespace-pre-line text-ink-soft text-pretty">
              {artist.bio}
            </p>
          )}
          {(artist.instagram || artist.website) && (
            <div className="mt-6 flex flex-wrap gap-3">
              {[
                artist.instagram && { href: artist.instagram, label: instagramLabel(artist.instagram), Icon: InstagramIcon },
                artist.website && { href: artist.website, label: host(artist.website), Icon: Globe },
              ]
                .filter((l) => !!l)
                .map(({ href, label, Icon }) => (
                  <PillLink key={href} href={href} target="_blank" rel="noopener noreferrer" variant="secondary" className="group">
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    {label}
                    <span className="sr-only">{t.about.newTab}</span>
                    <ArrowUpRight
                      className="size-4 shrink-0 text-ink-soft transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </PillLink>
                ))}
            </div>
          )}
        </div>
      </Reveal>

      {works.length > 0 ? (
        <h2 className="mb-4 text-sm font-semibold text-ink">{t.about.artistWorks}</h2>
      ) : (
        <p className="text-base text-ink-soft">{t.about.noWorks}</p>
      )}
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
