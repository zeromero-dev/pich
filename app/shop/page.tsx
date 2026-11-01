import type { Metadata } from 'next'
import { categoriesOf, getCatalog } from '@/lib/hugeprofit'
import { getArtistProfiles, withArtistNames } from '@/lib/artists'
import { ShopView } from '@/components/shop/shop-view'

export const metadata: Metadata = {
  title: 'Крамничка',
  description: 'Оригінальні роботи сучасних українських митців у крамничці Плай Піч.',
}

export default async function ShopPage() {
  const [catalog, profiles] = await Promise.all([getCatalog(), getArtistProfiles()])
  const products = withArtistNames(catalog, profiles)
  return <ShopView products={products} categories={categoriesOf(products)} />
}
