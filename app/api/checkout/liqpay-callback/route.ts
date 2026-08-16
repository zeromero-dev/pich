import { NextResponse } from 'next/server'
import { getFreshProduct } from '@/lib/hugeprofit'
import { verifyCallback, decodeCallback } from '@/lib/liqpay/client'
import { decodePayload } from '@/lib/liqpay/payload'
import { createRemoteOrder, type OrderLine } from '@/lib/hugeprofit/orders'

/**
 * LiqPay's server_url webhook — the only place a CRM order is created for a
 * paid checkout. Cart lines + contact travel in this URL's own query string
 * (see plan Task 4); LiqPay's signed POST body only carries payment status.
 */
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  const encodedPayload = searchParams.get('payload')
  if (!encodedPayload) return new NextResponse(null, { status: 400 })

  const form = await request.formData()
  const data = form.get('data')
  const signature = form.get('signature')
  if (typeof data !== 'string' || typeof signature !== 'string') {
    return new NextResponse(null, { status: 400 })
  }

  if (!verifyCallback(data, signature)) {
    console.error('[liqpay-callback] signature mismatch')
    return new NextResponse(null, { status: 401 })
  }

  try {
    const callback = decodeCallback(data)
    if (callback.status !== 'success' && callback.status !== 'sandbox') {
      return new NextResponse(null, { status: 200 })
    }

    const orderId = Number(callback.order_id)
    const { paymentId, lines: locked, contact } = decodePayload(encodedPayload)

    if (paymentId !== orderId) {
      // The payload's order binding doesn't match what LiqPay's signature attested to —
      // either a bug or a replay/tamper attempt. Loud on purpose, same as the sold-out branch.
      console.error('[liqpay-callback] payload/order_id mismatch', { orderId, paymentId })
      return new NextResponse(null, { status: 200 })
    }

    const fresh = await Promise.all(locked.map((line) => getFreshProduct(line.productId)))
    const stillAvailable = fresh.every((product) => product?.inStock)

    if (!stillAvailable) {
      // Paid but sold out in the meantime — no automated refund exists.
      // Loud on purpose: this needs a human, never silently swallowed.
      console.error('[liqpay-callback] paid order not created — stock changed', {
        orderId,
        productIds: locked.map((l) => l.productId),
      })
      return new NextResponse(null, { status: 200 })
    }

    const lines: OrderLine[] = locked.map((line, index) => {
      const product = fresh[index]!
      return {
        productId: line.productId,
        sku: product.sku ?? '',
        name: product.name,
        price: line.price, // the price actually charged, not the (possibly stale) fresh price
        qty: line.qty,
      }
    })

    await createRemoteOrder(orderId, lines, contact, {
      isPaid: true,
      paymentType: 'LiqPay',
      orderText: `LiqPay order_id ${callback.order_id}`,
    })
  } catch (error) {
    console.error('[liqpay-callback] processing failed', {
      encodedPayloadPresent: !!encodedPayload,
      error,
    })
  }

  return new NextResponse(null, { status: 200 })
}
