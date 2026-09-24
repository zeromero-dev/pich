import { NextResponse } from 'next/server'
import { getFreshProduct } from '@/lib/hugeprofit'
import { buildCheckoutRequest, paymentsEnabled } from '@/lib/liqpay/client'
import { encodePayload } from '@/lib/liqpay/payload'
import { newOrderId, type OrderContact } from '@/lib/hugeprofit/orders'
import type { LockedLine } from '@/lib/liqpay/types'
import { WEBSITE_URL } from '@/lib/site'

/**
 * Validates the cart against fresh CRM data (unchanged from the unpaid flow)
 * and returns a signed LiqPay checkout request. No CRM order is created here
 * — that only happens in the liqpay-callback webhook, once payment clears.
 */

type RequestLine = { workId: string; qty: number; price: number }

type CheckoutRequest = {
  items: RequestLine[]
  contact: OrderContact
}

const MAX_ITEMS = 20
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function badRequest(error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status: 400 })
}

function parse(body: unknown): CheckoutRequest | null {
  if (typeof body !== 'object' || body === null) return null
  const { items, contact } = body as Partial<CheckoutRequest>

  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ITEMS) return null
  for (const item of items) {
    if (typeof item?.workId !== 'string' || !item.workId) return null
    if (item.qty !== 1) return null
    if (typeof item.price !== 'number' || !Number.isFinite(item.price)) return null
  }

  if (typeof contact !== 'object' || contact === null) return null
  const fields = ['name', 'email', 'phone', 'city', 'address'] as const
  for (const field of fields) {
    const value = contact[field]
    if (typeof value !== 'string' || !value.trim()) return null
    if (value.length > 300) return null
  }
  if (!EMAIL.test(contact.email.trim())) return null

  return {
    items,
    contact: {
      name: contact.name.trim(),
      email: contact.email.trim(),
      phone: contact.phone.trim(),
      city: contact.city.trim(),
      address: contact.address.trim(),
    },
  }
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

  const parsed = parse(body)
  if (!parsed) return badRequest('invalid')

  // Duplicate lines would mean qty > 1 by the back door.
  const ids = parsed.items.map((i) => i.workId)
  if (new Set(ids).size !== ids.length) return badRequest('invalid')

  // Checkout-time truth: bypasses the 5-minute catalog cache, one call per line
  // because `product_id` rejects a comma list.
  const fresh = await Promise.all(parsed.items.map((i) => getFreshProduct(i.workId)))

  const unavailable: string[] = []
  const repriced: { workId: string; name: string; was: number; now: number }[] = []
  const lines: LockedLine[] = []

  parsed.items.forEach((item, index) => {
    const product = fresh[index]
    if (!product || !product.inStock) {
      unavailable.push(item.workId)
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
    lines.push({ productId: product.id, price: product.price, qty: 1 })
  })

  if (unavailable.length > 0) {
    return NextResponse.json({ error: 'unavailable', unavailable }, { status: 409 })
  }
  if (repriced.length > 0) {
    return NextResponse.json({ error: 'repriced', repriced }, { status: 409 })
  }

  const paymentId = newOrderId(Date.now())
  const total = lines.reduce((sum, line) => sum + line.price * line.qty, 0)
  const payload = encodePayload({ paymentId, lines, contact: parsed.contact })

  // Money-safety, not just validation: this must reject before the buyer pays, not
  // after — a payload LiqPay's server_url can't round-trip means a paid order that
  // never gets created (see checkout.md gotchas). 1800 covers a full 20-item cart
  // with realistic field lengths; +44 for the HMAC tag encodePayload appends.
  if (payload.length > 1844) return badRequest('invalid')

  const { checkoutUrl, data, signature } = buildCheckoutRequest({
    orderId: paymentId,
    amount: total,
    description: `Замовлення Plai Pich #${paymentId}`,
    resultUrl: `${WEBSITE_URL}/checkout/result?paymentId=${paymentId}`,
    serverUrl: `${WEBSITE_URL}/api/checkout/liqpay-callback?payload=${payload}`,
  })

  return NextResponse.json({ checkoutUrl, data, signature }, { status: 200 })
}
