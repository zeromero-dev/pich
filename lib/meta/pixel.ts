import type { CartItem } from '@/components/providers'
import type { Product } from '@/lib/data'

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void
  }
}

export type PixelEvent = 'ViewContent' | 'AddToCart' | 'InitiateCheckout'

type Queued = [PixelEvent, Record<string, unknown>]
const queue: Queued[] = []
const QUEUE_CAP = 20

// Before consent (or before the pixel script runs) events wait here; denied consent never flushes them.
export function track(event: PixelEvent, params: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  if (window.fbq) window.fbq('track', event, params)
  else if (queue.length < QUEUE_CAP) queue.push([event, params])
}

export function clearQueue(): void {
  queue.length = 0
}

export function flushQueue(send: (event: PixelEvent, params: Record<string, unknown>) => void): void {
  for (const [event, params] of queue.splice(0)) send(event, params)
}

const base = { content_type: 'product', currency: 'UAH' }

export function trackViewContent(product: Product): void {
  track('ViewContent', {
    ...base,
    content_ids: [product.id],
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

export function trackInitiateCheckout(items: CartItem[], value: number): void {
  track('InitiateCheckout', {
    ...base,
    content_ids: items.map((i) => i.product.id),
    contents: items.map((i) => ({ id: i.product.id, quantity: i.qty })),
    value,
    num_items: items.reduce((s, i) => s + i.qty, 0),
  })
}

export function readMetaCookies(): { fbp?: string; fbc?: string } {
  if (typeof document === 'undefined') return {}
  const get = (name: string) =>
    document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))?.[1]
  return { fbp: get('_fbp'), fbc: get('_fbc') }
}
