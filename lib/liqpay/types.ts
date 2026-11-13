import type { OrderContact } from '@/lib/hugeprofit/orders'

/** What travels in the payment's `info` (lib/liqpay/payload.ts). */
export type LockedLine = {
  productId: string
  price: number
  qty: number
}

/** Conversions API match data; presence of `meta` on a payload means the buyer consented. */
export type MetaMatch = { fbp?: string; fbc?: string; userAgent?: string; ip?: string }

export type CheckoutPayload = {
  paymentId: number
  lines: LockedLine[]
  contact: OrderContact
  // Absent: no consent, or a payload minted before Meta tracking.
  meta?: MetaMatch
}

export type LiqPayCallbackData = {
  order_id: string
  status: string
  [key: string]: unknown
}

export type LiqPayStatus = 'success' | 'sandbox' | 'failure' | 'pending' | 'unknown'
