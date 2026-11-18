import { toKop } from '@/lib/mono/money'

/** Pure rules for /checkout/result (spec flow step 8): which payment attempt, and whether to clear the cart. */

/** `unknown`: this browser can't tell (no attempt cookie, or not this attempt's invoice) — never "a few seconds". */
export type ResultStatus = 'paid' | 'pending' | 'failed' | 'expired' | 'reversed' | 'unknown'

export function toResultStatus(
  read: { status: string; amount: number; finalAmount?: number; reference?: string } | null,
  ref: string,
): ResultStatus {
  if (!read) return 'pending' // read failed: temporary, refreshing can help
  if (read.reference !== ref) return 'unknown'
  if (read.status === 'success') {
    return read.finalAmount === undefined || read.finalAmount === read.amount ? 'paid' : 'reversed'
  }
  if (read.status === 'failure') return 'failed'
  if (read.status === 'expired') return 'expired'
  if (read.status === 'reversed') return 'reversed'
  return 'pending'
}

/** localStorage key of the cart (components/providers.tsx). */
export const CART_KEY = 'plai-pich-cart-v3'

/** Display only — the server re-prices in exact kopecks and refuses a sub-kopeck price. */
export function lineUnitKop(product: { price: number }): number {
  return toKop(product.price) ?? Math.round(product.price * 100)
}

/** sessionStorage: the attempt this tab redirected to mono with. */
export const ATTEMPT_KEY = 'plai-pich-attempt'
export type Attempt = { reference: string; fingerprint: string }

export function cartFingerprint(items: { productId: string; qty: number; unitPriceKop: number }[]): string {
  return items
    .map((i) => `${i.productId}:${i.qty}:${i.unitPriceKop}`)
    .sort()
    .join('|')
}

/** Clear only the cart that was paid for; the marker survives until a terminal status is shown. */
export function cartClearDecision(
  status: ResultStatus,
  ref: string,
  attempt: Attempt | null,
  currentFingerprint: string,
): { clear: boolean; dropAttempt: boolean } {
  const mine = attempt?.reference === ref
  return {
    clear: mine && status === 'paid' && attempt.fingerprint === currentFingerprint,
    dropAttempt: mine && status !== 'pending' && status !== 'unknown',
  }
}

/** Carts saved before the kopeck switch: a line whose price isn't whole kopecks is dropped, not shown as ₴NaN. */
export function migrateCart<T extends { product: { price: number }; qty: number }>(items: T[]): T[] {
  return items.filter((item) => toKop(item.product.price) !== null)
}
