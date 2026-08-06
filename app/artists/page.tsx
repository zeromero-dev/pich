import type { Metadata } from 'next'
import { ArtistsView } from '@/components/artists/artists-view'

export const metadata: Metadata = {
  title: 'Митці',
  description: 'Митці, чиї роботи представлені в арт-центрі Плай Піч.',
}

export default function ArtistsPage() {
  return <ArtistsView />
}
