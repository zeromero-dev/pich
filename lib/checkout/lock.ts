import { toKop, totalKop } from '@/lib/mono/money'
import type { LockedLine } from '@/lib/mono/types'

export type FreshProduct = { id: string; inStock: boolean; available: number; price: number; name: string } | null

export type LockResult =
  | { ok: true; lines: LockedLine[]; totalKop: number }
  | { ok: false; error: 'unavailable'; unavailable: string[] }
  | { ok: false; error: 'insufficient'; short: { workId: string; available: number }[] }
  | { ok: false; error: 'invalid_price'; productIds: string[] }
  | { ok: false; error: 'repriced'; repriced: { workId: string; name: string; was: number; now: number }[] }

/** Checkout-time truth from fresh CRM data; the buyer's price is for comparison only, in kopecks. */
export function lockLines(items: { workId: string; qty: number; price: number }[], fresh: FreshProduct[]): LockResult {
  const unavailable: string[] = []
  const short: { workId: string; available: number }[] = []
  const invalid: string[] = []
  const repriced: { workId: string; name: string; was: number; now: number }[] = []
  const lines: LockedLine[] = []

  items.forEach((item, index) => {
    const product = fresh[index]
    if (!product || !product.inStock) return void unavailable.push(item.workId)
    if (product.available < item.qty) return void short.push({ workId: item.workId, available: product.available })
    const unitPriceKop = toKop(product.price)
    if (unitPriceKop === null) return void invalid.push(product.id)
    // The buyer's figure is compared, never charged, so plain rounding is enough here.
    if (Math.round(item.price * 100) !== unitPriceKop) {
      return void repriced.push({ workId: item.workId, name: product.name, was: item.price, now: product.price })
    }
    lines.push({ productId: product.id, unitPriceKop, qty: item.qty })
  })

  if (unavailable.length > 0) return { ok: false, error: 'unavailable', unavailable }
  if (short.length > 0) return { ok: false, error: 'insufficient', short }
  if (invalid.length > 0) return { ok: false, error: 'invalid_price', productIds: invalid }
  if (repriced.length > 0) return { ok: false, error: 'repriced', repriced }
  const total = totalKop(lines)
  if (total === null) return { ok: false, error: 'invalid_price', productIds: lines.map((l) => l.productId) }
  return { ok: true, lines, totalKop: total }
}

export const MAX_CALLBACK_URL_BYTES = 8000

export function callbackUrl(origin: string, envelope: string, maxBytes = MAX_CALLBACK_URL_BYTES, bypassSecret?: string): string | null {
  const bypass = bypassSecret ? `&x-vercel-protection-bypass=${encodeURIComponent(bypassSecret)}` : ''
  const url = `${origin}/api/checkout/mono-callback?p=${envelope}${bypass}`
  return Buffer.byteLength(url) > maxBytes ? null : url
}
