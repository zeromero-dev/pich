import 'server-only'

import { crmPost, CrmError, REAL_SHOP_WAREHOUSE_ID, SHOP_WAREHOUSE_ID } from './client'

/**
 * Order creation against `POST /bapi/remote_orders`. Field shapes are from the
 * API docs — this endpoint has never been exercised against the live account,
 * which had zero remote orders as of 2026-08-12.
 */

export type OrderContact = {
  name: string
  email: string
  phone: string
  city: string
  address: string
}

export type OrderLine = {
  productId: string
  sku: string
  name: string
  price: number
  qty: number
}

export type PaymentInfo = {
  isPaid: boolean
  paymentType: string
  orderText?: string
}

export type CreatedOrder = {
  orderId: number
  total: number
}

type RemoteOrderResponse = {
  success?: boolean
  reservedProducts?: [number, string][]
}

/**
 * `order_id` is documented as an int, so no UUID. Milliseconds are unique
 * enough: we are the only writer and orders are minutes apart at best.
 */
export function newOrderId(now: number): number {
  return now
}

/** `first_name` is required; the form collects one combined name field. */
export function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/)
  return {
    first: parts[0] ?? '',
    last: parts.slice(1).join(' '),
  }
}

export function orderTotal(lines: OrderLine[]): number {
  return lines.reduce((sum, line) => sum + line.price * line.qty, 0)
}

export function buildOrderPayload(
  orderId: number,
  lines: OrderLine[],
  contact: OrderContact,
  payment: PaymentInfo,
) {
  const { first, last } = splitName(contact.name)
  return {
    data: {
      order_id: orderId,
      order_name: `Замовлення з сайту #${orderId}`,
      price: orderTotal(lines),
      currency: 'UAH',
      status: 'pending',
      first_name: first,
      last_name: last,
      phone: contact.phone,
      email: contact.email,
      address_1: {
        address_1: contact.address,
        city: contact.city,
        // Always 0 — the site does not price delivery (checkout.md).
        delivery_cost: 0,
      },
      info: {
        is_paid: payment.isPaid,
        payment_type: payment.paymentType,
        ...(payment.orderText ? { order_text: payment.orderText } : {}),
      },
      order_data: lines.map((line) => ({
        // `product_id` is the *marketplace* remote id; ours live in HugeProfit,
        // so the docs say to send null here and identify by local_product_id.
        product_id: null,
        local_product_id: Number(line.productId),
        id: Number(line.productId),
        name: line.name,
        sku: line.sku,
        quantity: line.qty,
        price: line.price,
        total: line.price * line.qty,
        is_paid: payment.isPaid,
        payment_type: payment.paymentType,
      })),
    },
  }
}

export async function createRemoteOrder(
  orderId: number,
  lines: OrderLine[],
  contact: OrderContact,
  payment: PaymentInfo,
): Promise<CreatedOrder> {
  // Money safety: sandbox payments must never reserve a real work. This is the
  // only place an order comes into existence, so it is the only place to check.
  if (process.env.LIQPAY_SANDBOX === '1' && SHOP_WAREHOUSE_ID === REAL_SHOP_WAREHOUSE_ID) {
    throw new CrmError(
      `refusing to create order ${orderId} in the real shop while LIQPAY_SANDBOX=1 — set CRM_WAREHOUSE_ID to a test warehouse`,
    )
  }

  const payload = buildOrderPayload(orderId, lines, contact, payment)
  await crmPost<RemoteOrderResponse>('remote_orders', payload)
  return { orderId, total: orderTotal(lines) }
}
