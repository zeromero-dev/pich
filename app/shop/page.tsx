import type { Metadata } from 'next'
import { ShopView } from '@/components/shop/shop-view'

export const metadata: Metadata = {
  title: 'Крамничка',
  description: 'Оригінальні роботи сучасних українських митців у крамничці Плай Піч.',
}

export default function ShopPage() {
  return <ShopView />
}
