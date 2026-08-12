import type { Metadata } from 'next'
import { artistsOf, getCatalog } from '@/lib/hugeprofit'
import { withProfiles } from '@/lib/artists'
import { ArtistsView } from '@/components/artists/artists-view'

export const metadata: Metadata = {
  title: 'Митці',
  description: 'Митці, чиї роботи представлені в арт-центрі Плай Піч.',
}

export default async function ArtistsPage() {
  const artists = artistsOf(await getCatalog()).map(withProfiles)
  return <ArtistsView artists={artists} />
}
