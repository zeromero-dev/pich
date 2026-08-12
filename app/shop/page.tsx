import type { Metadata } from 'next'
import { categoriesOf, getCatalog } from '@/lib/hugeprofit'
import { ShopView } from '@/components/shop/shop-view'

export const metadata: Metadata = {
  title: 'Крамничка',
  description: 'Оригінальні роботи сучасних українських митців у крамничці Плай Піч.',
}

export default async function ShopPage() {
  const products = await getCatalog()
  return <ShopView products={products} categories={categoriesOf(products)} />
}
