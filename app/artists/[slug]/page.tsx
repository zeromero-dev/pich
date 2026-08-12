import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { artistsOf, getCatalog, worksByArtistSlug } from '@/lib/hugeprofit'
import { withProfiles } from '@/lib/artists'
import { ArtistDetail } from '@/components/artists/artist-detail'

export async function generateStaticParams() {
  const artists = artistsOf(await getCatalog())
  return artists.map((a) => ({ slug: a.slug }))
}

async function findArtist(slug: string) {
  const products = await getCatalog()
  const artist = artistsOf(products).find((a) => a.slug === slug)
  return artist
    ? { artist: withProfiles(artist), works: worksByArtistSlug(products, slug) }
    : null
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const found = await findArtist(slug)
  if (!found) return { title: 'Митця не знайдено' }
  return {
    title: found.artist.name,
    description: `Роботи ${found.artist.name} у крамничці Плай Піч.`,
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
