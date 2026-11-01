import type { Metadata } from 'next'
import { getCatalog } from '@/lib/hugeprofit'
import { getArtistProfiles, rosterOf } from '@/lib/artists'
import { ArtistsView } from '@/components/artists/artists-view'

export const metadata: Metadata = {
  title: 'Митці',
  description: 'Митці, чиї роботи представлені в арт-центрі Плай Піч.',
}

export default async function ArtistsPage() {
  const [products, profiles] = await Promise.all([getCatalog(), getArtistProfiles()])
  const artists = rosterOf(products, profiles)
  return <ArtistsView artists={artists} />
}
