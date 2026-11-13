import type { CartItem } from '@/components/providers'
import type { Product } from '@/lib/data'

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void
  }
}

export type PixelEvent = 'ViewContent' | 'AddToCart' | 'InitiateCheckout'

export function track(event: PixelEvent, params: Record<string, unknown>): void {
  if (typeof window !== 'undefined') window.fbq?.('track', event, params)
}

const base = { content_type: 'product', currency: 'UAH' }

export function trackViewContent(product: Product): void {
  track('ViewContent', {
    ...base,
    content_ids: [product.id],
    content_name: product.name,
    value: product.price,
  })
}

export function trackAddToCart(product: Product, qty: number): void {
  track('AddToCart', {
    ...base,
    content_ids: [product.id],
    contents: [{ id: product.id, quantity: qty }],
    value: product.price * qty,
  })
}

export function trackInitiateCheckout(items: CartItem[]): void {
  track('InitiateCheckout', {
    ...base,
    content_ids: items.map((i) => i.product.id),
    contents: items.map((i) => ({ id: i.product.id, quantity: i.qty })),
    value: items.reduce((s, i) => s + i.product.price * i.qty, 0),
    num_items: items.reduce((s, i) => s + i.qty, 0),
  })
}

export function readMetaCookies(): { fbp?: string; fbc?: string } {
  if (typeof document === 'undefined') return {}
  const get = (name: string) =>
    document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))?.[1]
  return { fbp: get('_fbp'), fbc: get('_fbc') }
}
