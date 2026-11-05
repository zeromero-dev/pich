import type { OrderContact } from '@/lib/hugeprofit/orders'

/** What travels in the payment's `info` (lib/liqpay/payload.ts). */
export type LockedLine = {
  productId: string
  price: number
  qty: number
}

export type CheckoutPayload = {
  paymentId: number
  lines: LockedLine[]
  contact: OrderContact
}

export type LiqPayCallbackData = {
  order_id: string
  status: string
  [key: string]: unknown
}

export type LiqPayStatus = 'success' | 'sandbox' | 'failure' | 'pending' | 'unknown'
