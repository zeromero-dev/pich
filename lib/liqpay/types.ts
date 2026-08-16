import type { OrderContact } from '@/lib/hugeprofit/orders'

/** What travels in the server_url query string — kept lean, see plan header. */
export type LockedLine = {
  productId: string
  price: number
  qty: number
}

export type CheckoutPayload = {
  lines: LockedLine[]
  contact: OrderContact
}

export type LiqPayCallbackData = {
  order_id: string
  status: string
  [key: string]: unknown
}

export type LiqPayStatus = 'success' | 'sandbox' | 'failure' | 'pending' | 'unknown'
