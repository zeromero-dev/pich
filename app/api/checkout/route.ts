import { NextResponse } from 'next/server'
import { getFreshProduct } from '@/lib/hugeprofit'
import { buildCheckoutRequest, paymentsEnabled } from '@/lib/liqpay/client'
import { encodePayload } from '@/lib/liqpay/payload'
import { newOrderId, type OrderContact, type OrderDelivery } from '@/lib/hugeprofit/orders'
import { checkoutRequestSchema } from '@/lib/checkout/schema'
import { resolveDelivery } from '@/lib/checkout/delivery'
import type { LockedLine } from '@/lib/liqpay/types'
import { WEBSITE_URL } from '@/lib/site'

/**
 * Validates the cart against fresh CRM data (unchanged from the unpaid flow)
 * and returns a signed LiqPay checkout request. No CRM order is created here
 * — that only happens in the liqpay-callback webhook, once payment clears.
 */

function badRequest(error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status: 400 })
}

export async function POST(request: Request) {
  // Payments off (no LiqPay keys). 503, not 500: the cart is valid, the site
  // just cannot take money yet — and this must never throw at a buyer.
  if (!paymentsEnabled()) {
    return NextResponse.json({ error: 'payments_disabled' }, { status: 503 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return badRequest('invalid')
  }

  const result = checkoutRequestSchema.safeParse(body)
  if (!result.success) return badRequest('invalid')
  const parsed = result.data

  let delivery: OrderDelivery | null
  try {
    delivery = await resolveDelivery(parsed.delivery)
  } catch (error) {
    console.error('[checkout] Nova Poshta lookup failed', error)
    return NextResponse.json({ error: 'delivery_unavailable' }, { status: 503 })
  }
  if (!delivery) return badRequest('delivery')

  const contact: OrderContact = {
    ...parsed.contact,
    city: delivery.city,
    address: delivery.address,
    delivery: delivery.method,
  }

  // Checkout-time truth: bypasses the 5-minute catalog cache, one call per line
  // because `product_id` rejects a comma list.
  const fresh = await Promise.all(parsed.items.map((i) => getFreshProduct(i.workId)))

  const unavailable: string[] = []
  const short: { workId: string; available: number }[] = []
  const repriced: { workId: string; name: string; was: number; now: number }[] = []
  const lines: LockedLine[] = []

  parsed.items.forEach((item, index) => {
    const product = fresh[index]
    if (!product || !product.inStock) {
      unavailable.push(item.workId)
      return
    }
    if (product.available < item.qty) {
      short.push({ workId: item.workId, available: product.available })
      return
    }
    if (product.price !== item.price) {
      repriced.push({
        workId: item.workId,
        name: product.name,
        was: item.price,
        now: product.price,
      })
      return
    }
    lines.push({ productId: product.id, price: product.price, qty: item.qty })
  })

  if (unavailable.length > 0) {
    return NextResponse.json({ error: 'unavailable', unavailable }, { status: 409 })
  }
  if (short.length > 0) {
    return NextResponse.json({ error: 'insufficient', short }, { status: 409 })
  }
  if (repriced.length > 0) {
    return NextResponse.json({ error: 'repriced', repriced }, { status: 409 })
  }

  const paymentId = newOrderId(Date.now())
  const total = lines.reduce((sum, line) => sum + line.price * line.qty, 0)
  const { checkoutUrl, data, signature } = buildCheckoutRequest({
    orderId: paymentId,
    amount: total,
    description: `Замовлення Plai Pich #${paymentId}`,
    resultUrl: `${WEBSITE_URL}/checkout/result?paymentId=${paymentId}`,
    serverUrl: `${WEBSITE_URL}/api/checkout/liqpay-callback`,
    info: encodePayload({ paymentId, lines, contact }),
  })

  return NextResponse.json({ checkoutUrl, data, signature }, { status: 200 })
}
