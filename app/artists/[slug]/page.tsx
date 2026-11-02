import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { getCatalog, worksByArtistSlug } from '@/lib/hugeprofit'
import { getArtistProfiles, movedArtist, rosterOf, withArtistNames } from '@/lib/artists'
import { ArtistDetail } from '@/components/artists/artist-detail'

export async function generateStaticParams() {
  const [products, profiles] = await Promise.all([getCatalog(), getArtistProfiles()])
  const artists = rosterOf(products, profiles)
  return artists.map((a) => ({ slug: a.slug }))
}

async function findArtist(slug: string) {
  const [products, profiles] = await Promise.all([getCatalog(), getArtistProfiles()])
  const artist = rosterOf(products, profiles).find((a) => a.slug === slug)
  if (artist) return { artist, works: withArtistNames(worksByArtistSlug(products, slug), profiles) }
  // A hand-added artist's /artists/ar-7 moves to the CRM ID once the sync links the row.
  const moved = movedArtist(slug, profiles)
  if (moved) permanentRedirect(`/artists/${moved}`)
  return null
}

/** First ~155 characters of the bio, cut at a word: the length search results show. */
function snippet(text: string, max = 155): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  return `${flat.slice(0, flat.lastIndexOf(' ', max))}…`
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const found = await findArtist(slug)
  if (!found) return { title: 'Митця не знайдено' }
  const { name, bio, portrait, cover } = found.artist
  const image = portrait ?? cover
  return {
    title: name,
    description: bio ? snippet(bio) : `Роботи ${name} у крамничці Плай Піч.`,
    openGraph: { title: name, images: image ? [image] : undefined },
  }
}

export default async function ArtistPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const found = await findArtist(slug)
  if (!found) notFound()

  return <ArtistDetail artist={found.artist} works={found.works} />
}
