import type { Metadata } from 'next'
import { CheckoutView } from '@/components/checkout/checkout-view'

export const metadata: Metadata = {
  title: 'Оформлення',
  robots: { index: false },
}

export default function CheckoutPage() {
  return <CheckoutView />
}
