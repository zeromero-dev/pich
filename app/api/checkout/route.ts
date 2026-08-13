import { NextResponse } from 'next/server'
import { getFreshProduct } from '@/lib/hugeprofit'
import {
  createRemoteOrder,
  newOrderId,
  type OrderContact,
  type OrderLine,
} from '@/lib/hugeprofit/orders'

/**
 * Turns a cart draft into a CRM order. The client sends intent — work ids and
 * the price it displayed — never facts: every line is re-read from the CRM
 * uncached and the total is computed here (checkout.md rule 1).
 *
 * No payment step yet. Orders land unpaid (`info.is_paid: false`) and the
 * owners follow up — decided 2026-08-12.
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
  const lines: OrderLine[] = []

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
    lines.push({ product, qty: 1 })
  })

  if (unavailable.length > 0) {
    return NextResponse.json({ error: 'unavailable', unavailable }, { status: 409 })
  }
  if (repriced.length > 0) {
    return NextResponse.json({ error: 'repriced', repriced }, { status: 409 })
  }

  const orderId = newOrderId(Date.now())
  try {
    const order = await createRemoteOrder(orderId, lines, parsed.contact)
    return NextResponse.json(order, { status: 201 })
  } catch (error) {
    // The buyer has paid nothing, so a failure here costs them only a retry —
    // but the owners still need to see it.
    console.error('[checkout] order creation failed', { orderId, error })
    return NextResponse.json({ error: 'crm' }, { status: 502 })
  }
}
